import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

const f = Fastify({
  logger: true,
});

const DATA_FILE = 'ledger.json';
const balances: Map<string, number> = new Map();
const receipts: unknown[] = [];

async function save(): Promise<void> {
  // Persist balances/receipts/etc. to disk or DB
}

await f.register(rateLimit, { global: false });

f.post(
  '/admin/save',
  { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
  async (_req, _reply) => {
    await save();
    return { ok: true, file: DATA_FILE };
  }
);

f.post(
  '/admin/clear',
  { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
  async (_req, _reply) => {
    balances.clear();
    receipts.length = 0;
    await save();
    return { ok: true, cleared: true };
  }
);

async function main() {
  try {
    const PORT = Number(process.env.PORT ?? 8080);
    await f.listen({ port: PORT, host: '0.0.0.0' });
    f.log.info(Core ledger listening on :);
  } catch (e) {
    f.log.error(e);
    process.exit(1);
  }
}
void main();

process.on('SIGTERM', () => f.close());
process.on('SIGINT', () => f.close());
