import Fastify from 'fastify';
import { repo } from '../repos/mem';
export async function build() {
  const f = Fastify({ logger: true });

  f.post('/users', async (req: any) => {
    const id = crypto.randomUUID();
    const user = { id, email: req.body?.email ?? '', createdAt: new Date().toISOString() };
    return repo.upsert(id, user);
  });
  f.get('/users', async () => repo.all());

  return f;
}
if (import.meta.url === ile://) {
  const f = await build();
  await f.listen({ port: 8080, host: '0.0.0.0' });
}
