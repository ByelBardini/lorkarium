# Server

API Fastify 5 em `server/` (Node 22, ESM, `tsx`). Este hub cobre o **encanamento** transversal (env, banco, migrações, montagem do app, testes); cada módulo de feature tem o seu doc (`docs/context/<módulo>.md`). As camadas por sufixo estão no `AGENTS.md` e na skill `desenvolver-server`.

## Estrutura

- `src/index.ts` — entrada: `readEnv(process.env)` → `createDatabase` → `buildApp` → `listen`; fecha o pool no `onClose` e em SIGINT/SIGTERM
- `src/config/env.ts` — schema Zod do env (`readEnv`, tipos `Env`, `AdminSeedConfig`, `InvalidEnvError`)
- `src/config/drizzle-kit-env.ts` — `readDrizzleKitCredentials()`: o `DATABASE_URL` para o `drizzle-kit` (carrega `server/.env` se existir)
- `src/database/database.ts` — `createDatabase(url)` → `{ db, close }` (Drizzle sobre `pg.Pool`); tipo `Database`
- `src/database/schema.ts` — reexporta toda tabela (PO); é o `schema` do `drizzle-kit` e do cliente
- `src/database/migrate.ts` — `runMigrations(db)` aplica `server/drizzle/` (usado pelos testes de integração)
- `src/app/build-app.ts` — `buildApp({ env, db })`: Fastify com logger pino (JSON), `@fastify/cookie`; módulos registrados sob o prefixo `/api` (`API_PREFIX`); instancia os adaptadores do auth e decora `app.authGuards` na raiz (guardas para qualquer módulo, ver `auth.md`)
- `drizzle.config.ts` — config do `drizzle-kit` (schema → `drizzle/`)
- `vitest.config.ts` / `vitest.integration.config.ts` — projetos `@lorkarium/server` (unit) e `@lorkarium/server-integration`

## Env (`server/.env.example`)

| Variável         | Regra                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------- |
| `NODE_ENV`       | `development` (padrão) · `test` (logger mudo) · `production`                            |
| `PORT` / `HOST`  | padrão `3333` / `0.0.0.0`                                                               |
| `DATABASE_URL`   | obrigatório                                                                             |
| `ADMIN_EMAIL`    | opcional; só junto com `ADMIN_PASSWORD`; normalizado                                    |
| `ADMIN_PASSWORD` | opcional; só junto com `ADMIN_EMAIL`; mínimo 12 caracteres só com `NODE_ENV=production` |

`KEY=` vazio vale como ausente. O erro de boot cita cada variável e o valor recebido, mas redige `DATABASE_URL` e `ADMIN_PASSWORD`. Os scripts `dev`/`start` carregam `server/.env` por `--env-file-if-exists`; variável exportada no shell vence o `.env`.

## Scripts

- `pnpm db:generate` — `drizzle-kit generate`: SQL novo em `server/drizzle/` a partir de `schema.ts` (não precisa de banco)
- `pnpm db:migrate` — `drizzle-kit migrate` no `DATABASE_URL`
- `pnpm --filter @lorkarium/server build` — `tsdown` gera `server/dist/index.mjs` (detalhe em `docs/context/ci.md`) · `start:dist` — `node dist/index.mjs` (com `server/.env` se existir); `start`/`dev` seguem no `tsx`
- `pnpm test` — unit de todos os workspaces, **sem** integração · `pnpm test:integration` — só `server/test/integration/`

## Regras de arquitetura

- `process.env` só em `src/config/` e `src/index.ts` (o driver do `desenvolver-server` cobra).
- Quem cria a conexão a fecha: `index.ts` e o suporte de teste chamam `close()`; `buildApp` recebe o `db` pronto e não o fecha.
- O logger redige `req.headers.cookie` e `res.headers["set-cookie"]`; corpo de requisição nunca é logado.
- Rotas HTTP ficam sob `/api` (o proxy do Vite e a mesma origem em produção dependem disso).

## Testes

- Unit (`test/**`, exceto `test/integration/`): sem banco nem Fastify. Encanamento (`build-app`, `database`, `migrate`) não tem unit: é provado pela integração.
- Integração (`test/integration/**`): arquivos em série (um Postgres compartilhado), `hookTimeout` de 30 s. Sempre no Postgres descartável da receita do `/testar` (porta 5434), nunca no do `pnpm db:up`.

## Armadilhas

- `pnpm db:migrate` com o banco fora do ar falha só com `Exit status 1`, sem mensagem: o `drizzle-kit` engole o `ECONNREFUSED`. Confira se `pnpm db:up` subiu o `lorkarium-postgres-1` e se nada mais ocupa a 5432.
