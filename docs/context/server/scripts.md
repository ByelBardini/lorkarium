# Server · scripts

Detalhe do hub [`server.md`](../server.md): os scripts do server e da raiz que mexem no banco, no seed e no build.

- `pnpm db:generate` — `drizzle-kit generate`: SQL novo em `server/drizzle/` a partir de `schema.ts` (não precisa de banco)
- `pnpm db:migrate` — `drizzle-kit migrate` no `DATABASE_URL`
- `pnpm db:encrypt-emails` (raiz e server) — atualiza um banco anterior à `0039`: até a `0038`, cifra os e-mails em claro, o resto das migrações; rodar de novo cifra 0 (ver `auth/cifra.md`)
- `pnpm db:seed-dev` (`seed:dev` no server) — cria os jogadores de teste Bia e Caio no `DATABASE_URL`; recusa com `NODE_ENV=production`; rodar de novo pula quem já existe
- `pnpm db:seed-stress` (`seed:stress` no server) — a "Mesa de estresse" da Bia (mestre) com o Caio (entra pelo código como espectador e a Bia o promove a jogador pelo `MemberRoleService`, com a porta ao vivo muda): cena 100 × 100 no Escuro, 300 paredes, 40 luzes e 300 tokens (dois do Caio, com visão), criados **pelos services** do tabuleiro em lotes de 64 (`server/src/modules/dev-seed/`: `stress-scene.bo.ts` puro, `stress-scene-seed.service.ts`, `dev-seed.plugin.ts`). Sem arte nem condições (pedem asset e definição). Exige o `pnpm db:seed-dev` antes (`STRESS_SEED_PLAYERS_MISSING` cita o e-mail que falta); recusa `NODE_ENV=production` (`STRESS_SEED_REFUSED`); rodar de novo acha a mesa e não cria nada. A forma é a do bench do client (`client/test/support/stress-board.ts`, ver `client/performance.md`).
- `pnpm mail:preview [caixa]` (raiz e server) — manda os 11 e-mails do catálogo ao SMTP do `SMTP_URL` (o Mailpit do `pnpm db:up`); recusa sem `SMTP_URL` e em produção (ver `mail.md`)
- `pnpm --filter @lorkarium/server build` — `tsdown` gera `server/dist/index.mjs` e `server/dist/deploy-migrate.mjs` (mais um chunk comum; detalhe em `docs/context/ci.md`) · `start:dist` — `node dist/index.mjs` (com `server/.env` se existir); `start`/`dev` seguem no `tsx`
- `start:prod` (server) — `node dist/deploy-migrate.mjs && node dist/index.mjs`: migra e sobe, o que o `CMD` da imagem faz (ver `deploy.md`). O deploy **não** usa o `drizzle-kit`: ele é dependência de dev e lê o `drizzle.config.ts`, que não vão para a imagem; o `deploy-migrate` usa o migrador do `drizzle-orm` com a pasta `server/drizzle/` ao lado do `dist/`. Sai com 0 ("migrations applied") ou 1 com o erro e a causa em texto puro (`failureText`, `src/lib/failure-text.ts`: o `ECONNREFUSED` vem só no `code` do `cause`)
- `pnpm test` — unit de todos os workspaces, **sem** integração · `pnpm test:integration` — só `server/test/integration/`
