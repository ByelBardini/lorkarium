import Fastify from 'fastify';

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? '0.0.0.0';

const app = Fastify({ logger: true });

await app.listen({ port, host });
