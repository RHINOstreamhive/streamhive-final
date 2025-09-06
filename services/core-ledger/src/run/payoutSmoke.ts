import { computePayouts, type CreatorViewStats, type RevenueContext } from '../payoutGovernor.ts';

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
