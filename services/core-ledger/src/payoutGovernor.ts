/**
 * StreamHive Creator Payout Governor (v1)
 * ---------------------------------------------------------------------------
 * Locks (2025‑09‑04):
 *  - Shorts: $500 per 1,000,000 qualified views
 *  - Long-form: $1,000 per 1,000,000 qualified views
 *  - Global creator payout ceiling: 40% of payout‑eligible revenue (pool)
 *  - Diamonds = $0.01 each → 50,000 Diamonds per million Shorts views; 100,000 per million Long
 *  - Safety: Proof‑of‑View (PoV) + Anti‑Fraud gating; anomaly detection; payout holds/clawbacks; human review
 *
 * This module computes creator payouts from qualified (fraud‑screened) views and
 * enforces a 40% revenue ceiling via a pro‑rata scaling factor when needed.
 * It returns both USD and Diamonds, and tracks any deferred amounts.
 *
 * Framework‑agnostic: import into Fastify/Express/Nest, or use in jobs/ledger services.
 */

// ============================= Types & Config ============================= //

export type Period = 'daily' | 'weekly' | 'monthly';

export interface PayoutRates {
  /** USD per 1,000,000 qualified views for Shorts */
  perMillionShortUSD: number;
  /** USD per 1,000,000 qualified views for Long‑form */
  perMillionLongUSD: number;
}

export interface RevenueContext {
  period: Period;
  /** Ad revenue recognized for this period (eligible for payout pool) */
  adRevenueUSD: number;
  /** Subscription revenue allocated to creator pool for the period */
  subsRevenueUSD: number;
  /** Sponsorships/brand integrations/etc. counted into pool */
  otherRevenueUSD?: number;
  /** 0.0‑1.0 multiplier for eligible revenue portion (defaults to 1.0). */
  eligibleRevenueRatio?: number;
  /** Hard ceiling ratio for creator payouts (defaults to 0.40 = 40%). */
  payoutCeilingRatio?: number;
}

export interface CreatorViewStats {
  creatorId: string;
  /** PoV‑qualified views (already fraud‑screened + deduped) */
  shortQualifiedViews: number; // Shorts
  longQualifiedViews: number;  // Long‑form
  /** Optional anomaly score [0..1], 0 = clean, 1 = severe anomaly */
  anomalyScore?: number;
}

export interface CreatorPayoutResult {
  creatorId: string;
  baseUSD: number;      // before scaling
  scaledUSD: number;    // after ceiling scaling
  diamonds: number;     // scaledUSD / 0.01 (floored)
  scaleApplied: number; // 1.0 if no scaling; else 0<factor<=1
  deferredUSD: number;  // unallocated due to scaling + rounding
  flags: string[];      // e.g., ['HOLD_ANOMALY', 'REVIEW_SPIKE']
}

export interface PoolResult {
  period: Period;
  eligibleRevenueUSD: number;
  poolCeilingUSD: number; // eligibleRevenueUSD * payoutCeilingRatio
  totalBaseUSD: number;
  scaleFactor: number;    // 1.0 if totalBaseUSD <= poolCeilingUSD, else <1.0
  results: CreatorPayoutResult[];
  /** Total USD actually allocated after scaling */
  totalAllocatedUSD: number;
  /** Total USD deferred due to ceiling/rounding */
  totalDeferredUSD: number;
}

export const DEFAULT_RATES: PayoutRates = {
  perMillionShortUSD: 500,
  perMillionLongUSD: 1000,
};

export const DIAMOND_USD = 0.01; // $0.01 per Diamond

// Anomaly/HOLD thresholds — tune these with your Fraud Defense Mesh signals
export const DEFAULT_ANOMALY_REVIEW = 0.3; // soft review threshold
export const DEFAULT_ANOMALY_HOLD = 0.6;   // hard hold threshold

// =========================== Core Computation ============================ //

/** Compute base (pre‑ceiling) payout in USD from qualified views. */
export function computeBaseUSD(stats: CreatorViewStats, rates: PayoutRates = DEFAULT_RATES): number {
  const shortFactor = stats.shortQualifiedViews / 1_000_000;
  const longFactor  = stats.longQualifiedViews  / 1_000_000;
  const usd = shortFactor * rates.perMillionShortUSD + longFactor * rates.perMillionLongUSD;
  return round2(usd);
}

/** Compute eligible revenue and pool ceiling for the period. */
export function computePool(rev: RevenueContext): { eligible: number; ceiling: number } {
  const ratio = rev.eligibleRevenueRatio ?? 1.0;
  const ceilingRatio = rev.payoutCeilingRatio ?? 0.40; // 40%
  const eligible = round2((rev.adRevenueUSD + rev.subsRevenueUSD + (rev.otherRevenueUSD ?? 0)) * ratio);
  const ceiling = round2(eligible * ceilingRatio);
  return { eligible, ceiling };
}

/**
 * Enforce the 40% ceiling by pro‑rata scaling when needed.
 * Optionally flag/hold payouts based on anomaly scores.
 */
export function computePayouts(
  creators: CreatorViewStats[],
  revenue: RevenueContext,
  rates: PayoutRates = DEFAULT_RATES,
  opts?: { reviewThreshold?: number; holdThreshold?: number }
): PoolResult {
  const reviewT = opts?.reviewThreshold ?? DEFAULT_ANOMALY_REVIEW;
  const holdT   = opts?.holdThreshold   ?? DEFAULT_ANOMALY_HOLD;

  const baseMap = new Map<string, number>();
  let totalBaseUSD = 0;

  for (const c of creators) {
    const base = computeBaseUSD(c, rates);
    baseMap.set(c.creatorId, base);
    totalBaseUSD += base;
  }
  totalBaseUSD = round2(totalBaseUSD);

  const { eligible, ceiling } = computePool(revenue);
  const scale = totalBaseUSD <= ceiling || totalBaseUSD === 0 ? 1.0 : clamp(ceiling / totalBaseUSD, 0, 1);

  const results: CreatorPayoutResult[] = [];
  let allocated = 0;
  let deferred = 0;

  for (const c of creators) {
    const base = baseMap.get(c.creatorId)!;
    const scaledUSDraw = base * scale;
    const scaledUSDr2 = round2(scaledUSDraw);

    // Convert to Diamonds (floor to avoid over‑pay), track rounding remainder as deferred
    const rawDiamonds = scaledUSDr2 / DIAMOND_USD;
    const diamonds = Math.floor(rawDiamonds);
    const diamondsUSD = round2(diamonds * DIAMOND_USD);
    const roundingLoss = round2(scaledUSDr2 - diamondsUSD); // kept as deferred

    const flags: string[] = [];
    const anomaly = c.anomalyScore ?? 0;
    if (anomaly >= holdT) flags.push('HOLD_ANOMALY');
    else if (anomaly >= reviewT) flags.push('REVIEW_ANOMALY');

    // Spike detection (simple heuristic — replace with velocity/novelty models)
    if (spikeHeuristic(c)) flags.push('REVIEW_SPIKE');

    const creatorDeferred = round2((scaledUSDr2 - diamondsUSD));

    results.push({
      creatorId: c.creatorId,
      baseUSD: base,
      scaledUSD: scaledUSDr2,
      diamonds,
      scaleApplied: scale,
      deferredUSD: creatorDeferred,
      flags,
    });

    allocated += diamondsUSD;
    deferred += creatorDeferred;
  }

  return {
    period: revenue.period,
    eligibleRevenueUSD: eligible,
    poolCeilingUSD: ceiling,
    totalBaseUSD: round2(totalBaseUSD),
    scaleFactor: scale,
    results,
    totalAllocatedUSD: round2(allocated),
    totalDeferredUSD: round2(deferred),
  };
}

// ============================ Safety Utilities =========================== //

/** Replace with real spike detection: compare shorts/long view mixes, velocity, geo mix, etc. */
function spikeHeuristic(c: CreatorViewStats): boolean {
  const total = c.shortQualifiedViews + c.longQualifiedViews;
  // Example: flag sudden blasts of >2M views in the period as a review (tune per period)
  return total > 2_000_000;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ================================ Examples =============================== //

// Example usage (only runs if file is executed directly with ts-node)
if (import.meta.url === `file://${process.argv[1]}`) {
  const creators: CreatorViewStats[] = [
    { creatorId: 'alice', shortQualifiedViews: 1_000_000, longQualifiedViews: 0 },
    { creatorId: 'bob',   shortQualifiedViews: 0,         longQualifiedViews: 1_000_000 },
  ];

  const revenue: RevenueContext = {
    period: 'daily',
    adRevenueUSD: 1500,
    subsRevenueUSD: 0,
  };

  const pool = computePayouts(creators, revenue);
  console.log(JSON.stringify(pool, null, 2));
}

// ================================ Tests ================================= //

/** Minimal Jest‑style tests (pseudo). Integrate with your test runner. */
export function _test() {
  // Case 1: No scaling needed
  const rev1: RevenueContext = { period: 'daily', adRevenueUSD: 4000, subsRevenueUSD: 0 };
  const c1: CreatorViewStats[] = [
    { creatorId: 'c1', shortQualifiedViews: 1_000_000, longQualifiedViews: 0 }, // $500
    { creatorId: 'c2', shortQualifiedViews: 0, longQualifiedViews: 1_000_000 }, // $1000
  ];
  const r1 = computePayouts(c1, rev1);
  assertApprox(r1.poolCeilingUSD, 1600); // 40% of 4000
  assertApprox(r1.totalBaseUSD, 1500);
  assertApprox(r1.scaleFactor, 1.0);
  assert(r1.results[0].diamonds === 50000); // $500 -> 50k diamonds
  assert(r1.results[1].diamonds === 100000); // $1000 -> 100k diamonds

  // Case 2: Scaling engaged
  const rev2: RevenueContext = { period: 'daily', adRevenueUSD: 1000, subsRevenueUSD: 0 };
  const r2 = computePayouts(c1, rev2);
  // Ceiling = $400; base = $1500; scale ≈ 0.2666...
  approx(r2.scaleFactor, 0.2667, 1e-4);
  // Alice: $500 * scale ≈ $133.33 -> 13,333 diamonds floored to 13,333
  assert(r2.results[0].diamonds === 13333);
  // Bob: $1000 * scale ≈ $266.67 -> 26,666 diamonds floored
  assert(r2.results[1].diamonds === 26666);
}

function assert(cond: any, msg?: string) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function assertApprox(a: number, b: number, eps = 1e-9) {
  if (Math.abs(a - b) > eps) throw new Error(`expected ${a} ≈ ${b}`);
}
function approx(a: number, b: number, eps = 1e-3) { assertApprox(a, b, eps); }

// =============================== Integration ============================ //

/**
 * Integration notes:
 * - Upstream PoV pipeline must emit qualified views per creator & content type.
 *   Signals include: device fingerprint, signed telemetry (HMAC), watch‑time thresholds,
 *   view deduplication, ASN/geo/velocity filters, invisible challenges, concurrency checks,
 *   referrer/domain allow‑lists, session integrity, player visibility, ad‑render proofs.
 * - Persist PoolResult + per‑creator flags into the Ledger service for auditability.
 * - For flags including HOLD_*, do not settle on‑chain/off‑platform until cleared.
 * - Human review: auto‑open case when flags contain REVIEW_* or anomalyScore exceeds threshold.
 * - Proration granularity: you can run computePayouts daily and settle weekly/monthly.
 * - Rounding: We floor Diamonds to avoid over‑payment; carry remainder as deferredUSD.
 */
