# CI

Qualidade e testes do monorepo: scripts de teste por camada, cobertura e (nas seções seguintes) o pipeline do GitHub Actions. Todo job do CI chama um script da raiz; o comando nunca é repetido no YAML.

## Testes por camada

| Script                  | Projeto(s) Vitest                              | O que prova                                                        |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm test:packages`    | `@lorkarium/game-core`, `@lorkarium/contracts` | regra de jogo pura e DTO com regra própria                         |
| `pnpm test:client`      | `@lorkarium/client`                            | `src/lib/`, stores, serviços, conta do renderer                    |
| `pnpm test:server`      | `@lorkarium/server`                            | BO, mapper, service, config e adaptadores (sem banco, sem Fastify) |
| `pnpm test:integration` | `@lorkarium/server-integration`                | bordas, DAO, permissão e isolamento por campanha em Postgres real  |
| `pnpm test`             | todos menos a integração                       | atalho local, sem cobertura                                        |

- Os três primeiros rodam com `--coverage` (`@vitest/coverage-v8`), configurado em `vitest.config.ts`: reporter `text-summary` (log) + `html` (em `coverage/`). **Sem limiar mínimo**: cenário vem do contrato, não de linha descoberta (skill `testar`). A integração roda sem cobertura.
- `pnpm typecheck` checa os specs: o `include` de cada `tsconfig.json` de workspace tem `test`.

## Build

`pnpm build` roda o `build` de cada workspace: client (`tsc && vite build` → `client/dist/`) e server (`tsdown` → `server/dist/index.mjs` + sourcemap). Config em `server/tsdown.config.ts`:

- ESM, `platform: 'node'`, alvo `node22`, entrada `src/index.ts`.
- `@lorkarium/*` vão **dentro** do bundle (`deps.alwaysBundle`): os pacotes internos exportam `.ts` cru, que o Node não carrega de `node_modules`.
- As outras dependências ficam externas (inclusive o binário nativo do `@node-rs/argon2`): o deploy precisa do `node_modules` de produção do server ao lado do `dist/`.
- `src/database/migrate.ts` não entra no bundle; migração em produção é `pnpm db:migrate`.

## Pipeline (`.github/workflows/ci.yml`)

Roda em todo `pull_request` e em `push` na `main`. `permissions: contents: read`; `concurrency` por ref, cancelando só run antigo de PR. Todo job começa com `actions/checkout` + o composite `./.github/actions/setup` (pnpm pelo `packageManager`, Node pelo `.nvmrc`, cache do store, `pnpm install --frozen-lockfile` com `HUSKY=0`).

| Job                | Comando                                                                                        | O que barra                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `quality`          | `lint`, `format:check`, `typecheck`, os 3 `autoteste.mjs` das skills                           | estilo, formato, tipo (inclusive de spec), driver de skill quebrado |
| `test-packages`    | `pnpm test:packages`                                                                           | regra do game-core, DTO do contracts                                |
| `test-client`      | `pnpm test:client`                                                                             | lógica do client                                                    |
| `test-server`      | `pnpm test:server`                                                                             | unit do server                                                      |
| `test-integration` | service `postgres:17-alpine` (tmpfs) → `pnpm db:migrate` → `pnpm test:integration`             | borda, DAO, migração quebrada                                       |
| `build`            | `pnpm build`                                                                                   | client ou server que não empacota                                   |
| `e2e`              | mesmo Postgres de serviço → `db:migrate` → `db:seed-dev` → `e2e:install` → `test:e2e` (15 min) | client que não abre ou não alcança o server pelo proxy              |
| `ci-ok`            | `if: always()`, `needs` de todos; falha se algum `failure`/`cancelled`                         | é o **único** check obrigatório da `main`                           |

- `pnpm audit --prod --audit-level high` roda no `quality` com `continue-on-error`: informativo.
- O `coverage/` de cada job de teste sobe como artefato (`coverage-<camada>`, 7 dias), mesmo com teste vermelho.
- Falha no `e2e`: artefato `playwright-report` (relatório HTML + `test-results/` com o trace do retry; abrir com `pnpm --filter @lorkarium/e2e exec playwright show-trace <zip>`). Sem cache de navegador: o `--with-deps` instala as libs do SO de qualquer jeito.
- Sharding (`--shard` + blob report + `merge-reports`) só quando a suíte e2e passar de ~5 min.
- **Job novo entra no `needs` do `ci-ok`**; senão ele roda mas não protege a `main`. Job pulado por `if:` conta como sucesso para o `ci-ok`.
- Action sempre fixada por SHA completo com `# vX.Y.Z` ao lado (o Dependabot atualiza os dois).
- Validar antes do push: `MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12 -no-color`.

Reproduzir um job localmente: o mesmo script da raiz. Para `test-integration`, o Postgres descartável da receita do `/testar` + `DATABASE_URL` + `NODE_ENV=test`, depois `pnpm db:migrate && pnpm test:integration`.

## Supply chain

- Actions fixadas por SHA completo (tag pode ser movida para código malicioso); o comentário `# vX.Y.Z` diz a versão.
- `.github/dependabot.yml`: `npm` (diretório `/`, semanal, grupos `dev-dependencies` e `production-dependencies` só para minor/patch; major vem em PR próprio) e `github-actions` (semanal, um grupo, atualiza SHA e comentário juntos). Os dois com `cooldown.default-days: 7`, a quarentena para a comunidade detectar release comprometida.
- `pnpm audit` é informativo (ver Pipeline).
- Proteção da `main` (configurada no GitHub, fora do repo): exigir PR e o check `ci-ok`. Só ele é obrigatório: um filtro por pasta (`paths:`) deixaria check obrigatório pendente para sempre, e o `ci-ok` permite ligar `dorny/paths-filter` depois sem travar PR.

## Hook local

`pnpm install` roda o `prepare` (`husky`), que aponta o `core.hooksPath` para `.husky/_`. O `.husky/pre-commit` chama o `lint-staged` (config no `package.json` da raiz), só nos arquivos _staged_:

- `*.{ts,tsx,js,mjs}` → `eslint --fix --no-warn-ignored` e `prettier --write`;
- `*.{json,md,css,yml,yaml}` → `prettier --write`.

Formato e erro corrigível são consertados dentro do commit; erro de ESLint sem correção automática (`any`, variável não usada) **barra** o commit. Os ignores do ESLint e do Prettier valem (`docs/pages/`, fixtures das skills). Teste e typecheck ficam no CI. Emergência: `git commit --no-verify` — o `quality` do CI barra do mesmo jeito.

## E2E

Workspace `e2e/` (`@lorkarium/e2e`, `@playwright/test`, só Chromium), fora do Vitest. `pnpm e2e:install` baixa o Chromium com as libs do SO; `pnpm test:e2e` roda `e2e/test/`.

- O `webServer` de `e2e/playwright.config.ts` sobe o server (`pnpm --filter @lorkarium/server start`, pronto quando `/api/health` dá 200) e o client: `vite` local; no CI (`CI=1`), `vite build` + `vite preview` na 5173, que herda o `server.proxy` de `/api`.
- Fora do CI, `reuseExistingServer`: um `pnpm dev` já de pé é reaproveitado.
- O server precisa de `DATABASE_URL` apontando para um Postgres **migrado e com o seed de dev** (o descartável da receita do `/testar` + `pnpm db:migrate` + `pnpm db:seed-dev`).
- No CI: `forbidOnly`, `retries: 2`, `workers: 1`, `trace: 'on-first-retry'`, reporter `github` + `html` (`e2e/playwright-report/`).
- `e2e/test/smoke.spec.ts`: a home abre sem erro de página/console e `/api/health` responde 200 **pela origem do client** (prova proxy + server + banco).
- `e2e/test/home.spec.ts`: loga com o admin semeado, cria "Mesa E2E <timestamp>" (Tormenta20), vê "Mesa criada" com código `XXXX-XXXX`, acha a linha na lista, abre o modal, "Entrar na mesa" chega a "O tabuleiro abre aqui." e, de volta, a faixa "Continuar" mostra a mesa.
- `e2e/test/table-presence.spec.ts`: dois `browser.newContext()`. O admin cria "Mesa ao vivo <timestamp>" e lê o código; Bia (do seed de dev) loga, entra pelo código e abre a mesa; o admin abre a mesa; no painel "Na mesa" de cada um o outro aparece "online". Bia fecha a página e, em até 10 s (tolerância de 5 s + margem), o admin a vê "offline". Critérios 5, 6 e 12 do §13.
- `e2e/test/support/sign-in.ts` (`adminCredentials()`, `signIn(page, credenciais)`, compartilhados pelos specs) e `dev-players.ts` (`BIA`, as credenciais do `pnpm db:seed-dev`; mudam junto com o `dev-players-seed.bo.ts`).
- Credenciais: o spec lê `ADMIN_EMAIL`/`ADMIN_PASSWORD` do ambiente (o mesmo admin que o server semeia no boot). No CI o job `e2e` define um admin descartável no `env`; localmente o `playwright.config.ts` carrega o `server/.env` sem sobrescrever o que já está exportado.
- Local: o `webServer` reaproveita o que já roda na 3333/5173 (`reuseExistingServer`). Um `pnpm dev` antigo, ou um banco sem `pnpm db:migrate`, faz o e2e falhar por 404/500 que não são do código.

## Armadilhas

- Tirar o `ws: true` do proxy do Vite **não** derruba o e2e de presença: o `socket.io-client` começa em long-polling HTTP, que passa pelo proxy comum, e só depois tenta o upgrade para websocket. O `ws: true` é o que permite o websocket; a prova de que o spec morde é quebrar a conversa (outro `path` no transporte do client), que deixa o painel sem participantes.

- `--coverage.include` é relativo à **pasta de cada projeto**, não à raiz: `src/**` funciona; `server/src/**` ou `packages/*/src/**` dão `Unknown% (0/0)` sem erro nenhum.
- Com algum teste vermelho o Vitest não imprime a cobertura; o relatório só sai com a suíte verde.
- `tsdown` sem `--config-loader tsx` quer o pacote `unrun` para ler o `tsdown.config.ts` (o Node 22.17 não remove tipos sozinho). O script `build` já passa a flag.
