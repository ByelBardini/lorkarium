import { buildApp } from './app/build-app';

const port = Number(process.env.PORT ?? 3333);
const app = buildApp();
await app.listen({ port });
