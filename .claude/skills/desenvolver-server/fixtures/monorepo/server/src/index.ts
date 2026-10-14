import { buildApp } from './app/build-app';

const app = buildApp();
await app.listen({ port: Number(process.env.PORT ?? 3333) });
