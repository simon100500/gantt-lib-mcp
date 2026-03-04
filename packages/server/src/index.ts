// packages/server/src/index.ts — stub, implemented in plan 07-03
import Fastify from 'fastify';

const server = Fastify({ logger: true });

server.get('/health', async () => ({ status: 'ok' }));

const PORT = Number(process.env.PORT ?? 3000);
await server.listen({ port: PORT, host: '0.0.0.0' });
console.log(`[server] Listening on :${PORT}`);
