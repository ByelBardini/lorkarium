# Server

API Fastify 5 em `server/` (Node 22, ESM, `tsx`). Este hub cobre o **encanamento** transversal (env, banco, migrações, montagem do app, testes); cada módulo de feature tem o seu doc (`docs/context/<módulo>.md`). As camadas por sufixo estão no `AGENTS.md` e na skill `desenvolver-server`.

## Estrutura

- `src/index.ts` — entrada: `readEnv(process.env)` → `createDatabase` → `buildApp` → `listen`; fecha o pool no `onClose` e em SIGINT/SIGTERM
- `src/config/env.ts` — schema Zod do env (`readEnv`, tipos `Env`, `AdminSeedConfig`, `InvalidEnvError`)
- `src/dev-seed.ts` — segunda raiz de composição (`pnpm db:seed-dev`): `readEnv(readProcessEnv())` → `createDatabase` → `DevPlayersSeedService` → saída em texto puro → `close` (ver `auth.md`, Seed de desenvolvimento)
- `src/config/process-env.ts` — `readProcessEnv()`: o `process.env` cru para uma raiz que não é o `index.ts`
- `src/config/drizzle-kit-env.ts` — `readDrizzleKitCredentials()`: o `DATABASE_URL` para o `drizzle-kit` (carrega `server/.env` se existir)
- `src/database/database.ts` — `createDatabase(url)` → `{ db, close }` (Drizzle sobre `pg.Pool`); tipo `Database`
- `src/database/schema.ts` — reexporta toda tabela (PO); é o `schema` do `drizzle-kit` e do cliente
- `src/database/transaction.ts` — `runInTransaction(db, (tx) => …)`: confirma se o callback resolve, desfaz e relança o mesmo erro se ele lança; tipos `Transaction` e `DatabaseExecutor` (`Database | Transaction`), que é o que o construtor de DAO novo aceita
- `src/database/migrate.ts` — `runMigrations(db)` aplica `server/drizzle/` (usado pelos testes de integração)
- `src/lib/invalid-body.ts` — `invalidBodyError(zodError)`: o corpo 400 `INVALID_BODY` que toda borda devolve quando o DTO recusa (cita caminho e regra, nunca o valor)
- `src/app/build-app.ts` — `buildApp({ env, db })`: Fastify com logger pino (JSON), `@fastify/cookie`; módulos registrados sob o prefixo `/api` (`API_PREFIX`); instancia os adaptadores do auth e decora `app.authGuards` na raiz (guardas para qualquer módulo, ver `auth.md`); `wireRealtime` liga o Socket.IO e o módulo `sessions` (ver `sessions.md`)
- `src/realtime/` — Socket.IO (seção Tempo real): `realtime-server.ts` (`attachRealtime`), `same-origin.ts` (`isSameOrigin`), `rooms.ts` (`campaignRoom(id)` → `campaign:<id>`, `campaignUserRoom`, `campaignMastersRoom`), `realtime-ack.ts` (`answerAck(ack, work, failureOf, onFailure)`: responde o ack com o resultado ou com o `ApiErrorDto`)
- `drizzle.config.ts` — config do `drizzle-kit` (schema → `drizzle/`)
- `drizzle/` — migrações: `0000_auth`, `0001_campaigns`, `0002_scenes` (tabela `scenes`, `campaigns.active_scene_id` e o `INSERT … SELECT` que dá cena às mesas existentes), `0003_tokens`, `0004_conditions` (com a lista inicial para as mesas existentes) e `0005_combat`. O `db:generate` gera nome aleatório: renomear o `.sql` e o `tag` no `meta/_journal.json`; SQL de dados vai à mão no fim do arquivo, depois de um `--> statement-breakpoint`
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
- `pnpm db:seed-dev` (`seed:dev` no server) — cria os jogadores de teste Bia e Caio no `DATABASE_URL`; recusa com `NODE_ENV=production`; rodar de novo pula quem já existe
- `pnpm --filter @lorkarium/server build` — `tsdown` gera `server/dist/index.mjs` (detalhe em `docs/context/ci.md`) · `start:dist` — `node dist/index.mjs` (com `server/.env` se existir); `start`/`dev` seguem no `tsx`
- `pnpm test` — unit de todos os workspaces, **sem** integração · `pnpm test:integration` — só `server/test/integration/`

## Regras de arquitetura

- `process.env` só em `src/config/` e `src/index.ts` (o driver do `desenvolver-server` cobra). Outra raiz (o `dev-seed.ts`) lê pelo `readProcessEnv()`.
- Quem cria a conexão a fecha: `index.ts` e o suporte de teste chamam `close()`; `buildApp` recebe o `db` pronto e não o fecha.
- O logger redige `req.headers.cookie` e `res.headers["set-cookie"]`; corpo de requisição nunca é logado.
- Transação: quem abre é o **service**, pelo `runInTransaction` (recebido por dependência, para o unit trocá-lo por fake); o DAO só recebe o `tx` no construtor e nunca abre transação.
- Rotas HTTP ficam sob `/api` (o proxy do Vite e a mesma origem em produção dependem disso).

## Tempo real (`src/realtime/`)

- `attachRealtime(app, { authenticate, sessionCookie })` cria `new Server(app.server)` (sem `fastify-socket.io`, que não declara Fastify 5) em `REALTIME_PATH` (`/api/socket.io`), `serveClient: false`, sem `connectionStateRecovery`. Devolve `{ io, onConnection(listener), reauthenticate(socket) }`; o `buildApp` o chama com `auth.guards.authenticateToken` e `SESSION_COOKIE`.
- **Handshake:** `io.use` lê o cookie `lk_session` do handshake por `app.parseCookie` e chama `authenticate`. Sessão ausente, desconhecida ou encerrada → `connect_error` com `message: 'UNAUTHENTICATED'` (e o `ApiErrorDto` em `data`); falha inesperada → `INTERNAL_ERROR` no log. O usuário e o token ficam em `socket.data` (`RealtimeSocketData`: `user`, `token`, `campaignIds` — as mesas da conexão, vazio no handshake); identidade **nunca** vem do payload.
- **Revalidação:** `reauthenticate(socket)` relê a sessão pelo token do handshake (`null` depois de logout ou expiração); os gateways chamam a cada comando.
- **Origem:** `allowRequest` aceita só `Origin` cujo host é igual ao `Host`; sem `Origin` (cliente que não é navegador) passa, mas o cookie continua obrigatório. Sem env var.
- **Fechamento:** `preClose` desconecta os sockets e fecha o engine (`io.close()` fecharia o `app.server`, que o Fastify fecha logo depois).
- Limite de comandos do tabuleiro por conexão (40 de uma vez, 20/s): no gateway do `board` (ver `board.md`).
- Log por `app.log` com `userId` e `socketId`, nunca com o cookie. Tipos `RealtimeServer`/`RealtimeSocket` com `TableClientEvents`/`TableServerEvents` do contracts (sessão + tabuleiro). O `wireRealtime` liga `sessions` e `board` (este com o `scenes`).

## Testes

- Unit (`test/**`, exceto `test/integration/`): sem banco nem Fastify. Encanamento (`build-app`, `database`, `migrate`) não tem unit: é provado pela integração.
- Integração (`test/integration/**`): `test/support/sign-in.ts` (`signUpAndLogin(app, db, nome)` → `{ id, token }`) e `test/support/realtime-client.ts` (`connectRealtime(url, { token, origin })`, só websocket e sem reconexão; `disconnectionOf(socket)`); o handshake é provado em `realtime.spec.ts` (app em porta efêmera por `app.listen({ port: 0 })`).
- Integração (`test/integration/**`): arquivos em série (um Postgres compartilhado), `hookTimeout` de 30 s. Sempre no Postgres descartável da receita do `/testar` (porta 5434), nunca no do `pnpm db:up`.

## Armadilhas

- O proxy na frente do server precisa **preservar o `Host`** (`changeOrigin: false` no Vite, que é o padrão; o proxy reverso de produção também): a conexão Socket.IO compara `Origin` com `Host` e recusa se divergirem.

- `pnpm db:migrate` com o banco fora do ar falha só com `Exit status 1`, sem mensagem: o `drizzle-kit` engole o `ECONNREFUSED`. Confira se `pnpm db:up` subiu o `lorkarium-postgres-1` e se nada mais ocupa a 5432.
