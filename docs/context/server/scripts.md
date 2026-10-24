# Server · scripts

Detalhe do hub [`server.md`](../server.md): os scripts do server e da raiz que mexem no banco, no seed e no build.

- `pnpm db:generate` — `drizzle-kit generate`: SQL novo em `server/drizzle/` a partir de `schema.ts` (não precisa de banco)
- `pnpm db:migrate` — `drizzle-kit migrate` no `DATABASE_URL`
- `pnpm db:encrypt-emails` (raiz e server) — atualiza um banco anterior à `0039`: até a `0038`, cifra os e-mails em claro, o resto das migrações; rodar de novo cifra 0 (ver `auth/cifra.md`)
- `pnpm db:seed-dev` (`seed:dev` no server) — cria os jogadores de teste Bia e Caio no `DATABASE_URL`; recusa com `NODE_ENV=production`; rodar de novo pula quem já existe
- `pnpm db:seed-stress` (`seed:stress` no server) — a "Mesa de estresse" da Bia (mestre) com o Caio (jogador, entra pelo código): cena 100 × 100 no Escuro, 300 paredes, 40 luzes e 300 tokens (dois do Caio, com visão), criados **pelos services** do tabuleiro em lotes de 64 (`server/src/modules/dev-seed/`: `stress-scene.bo.ts` puro, `stress-scene-seed.service.ts`, `dev-seed.plugin.ts`). Sem arte nem condições (pedem asset e definição). Exige o `pnpm db:seed-dev` antes (`STRESS_SEED_PLAYERS_MISSING` cita o e-mail que falta); recusa `NODE_ENV=production` (`STRESS_SEED_REFUSED`); rodar de novo acha a mesa e não cria nada. A forma é a do bench do client (`client/test/support/stress-board.ts`, ver `client/performance.md`).
- `pnpm mail:preview [caixa]` (raiz e server) — manda os 11 e-mails do catálogo ao SMTP do `SMTP_URL` (o Mailpit do `pnpm db:up`); recusa sem `SMTP_URL` e em produção (ver `mail.md`)
- `pnpm --filter @lorkarium/server build` — `tsdown` gera `server/dist/index.mjs` (detalhe em `docs/context/ci.md`) · `start:dist` — `node dist/index.mjs` (com `server/.env` se existir); `start`/`dev` seguem no `tsx`
- `pnpm test` — unit de todos os workspaces, **sem** integração · `pnpm test:integration` — só `server/test/integration/`
