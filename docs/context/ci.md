# CI

Qualidade e testes do monorepo: scripts de teste por camada, cobertura e (nas seções seguintes) o pipeline do GitHub Actions. Todo job do CI chama um script da raiz; o comando nunca é repetido no YAML.

> **Detalhe por assunto em [`ci/`](ci/) — abra só o arquivo da tarefa.** Este hub guarda os testes por camada, o build, o pipeline, a supply chain e o hook local.

| Assunto                                           | Arquivo                             |
| ------------------------------------------------- | ----------------------------------- |
| E2E: Playwright, servidores, specs de `e2e/test/` | [`e2e.md`](ci/e2e.md)               |
| Armadilhas de teste, cobertura, build e e2e       | [`armadilhas.md`](ci/armadilhas.md) |

## Testes por camada

| Script                  | Projeto(s) Vitest                                                    | O que prova                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:packages`    | `@lorkarium/game-core`, `@lorkarium/contracts`, `@lorkarium/desktop` | regra de jogo pura, DTO com regra própria e a splash da casca desktop (o Rust roda no job `desktop`)                        |
| `pnpm test:client`      | `@lorkarium/client`                                                  | `src/lib/`, stores, serviços, conta do renderer                                                                             |
| `pnpm test:server`      | `@lorkarium/server`                                                  | BO, mapper, service, config e adaptadores (sem banco, sem Fastify)                                                          |
| `pnpm test:integration` | `@lorkarium/server-integration`                                      | bordas, DAO, permissão e isolamento por campanha em Postgres real; o teto de consultas por comando (`query-budget.spec.ts`) |
| `pnpm test`             | todos menos a integração                                             | atalho local, sem cobertura                                                                                                 |

- Os três primeiros rodam com `--coverage` (`@vitest/coverage-v8`), configurado em `vitest.config.ts`: reporter `text-summary` (log) + `html` (em `coverage/`). **Sem limiar mínimo**: cenário vem do contrato, não de linha descoberta (skill `testar`). A integração roda sem cobertura.
- `pnpm typecheck` checa os specs: o `include` de cada `tsconfig.json` de workspace tem `test`.
- `pnpm bench` (`vitest bench --run`, os `*.bench.ts`) fica **fora** do `pnpm test` e do CI: os runners oscilam e a suíte já é instável sob carga, então um limiar de tempo daria vermelho falso. É medição local, fase a fase (ver [`client/performance.md`](client/performance.md)).

## Build

`pnpm build` roda o `build` de cada workspace: client (`tsc && vite build` → `client/dist/`) e server (`tsdown` → `server/dist/index.mjs` e `server/dist/deploy-migrate.mjs`, com um chunk comum, + sourcemap). Config em `server/tsdown.config.ts`:

- ESM, `platform: 'node'`, alvo `node22`, entradas `src/index.ts` e `src/deploy-migrate.ts`.
- `@lorkarium/*` vão **dentro** do bundle (`deps.alwaysBundle`): os pacotes internos exportam `.ts` cru, que o Node não carrega de `node_modules`.
- As outras dependências ficam externas (inclusive o binário nativo do `@node-rs/argon2`): o deploy precisa do `node_modules` de produção do server ao lado do `dist/`.
- O `src/database/migrate.ts` entra no bundle pelo `deploy-migrate.mjs`: em produção a migração é ele, no início do container, sem `drizzle-kit` (ver `server/scripts.md`).

## Imagem de produção (`Dockerfile`)

`Dockerfile` e `.dockerignore` na raiz (detalhe e runbook em [`deploy.md`](deploy.md)). Estágios em `node:22-bookworm-slim`: `build` (`pnpm install --frozen-lockfile` só de `.`, `@lorkarium/client...` e `@lorkarium/server...`, cache do store por `--mount=type=cache`; build do client e do server), `prod-deps` (`pnpm --filter @lorkarium/server deploy --prod --legacy /out`: o pnpm 11 pede `--legacy` sem `inject-workspace-packages`) e `runtime` (`node_modules` de produção, `server/dist`, `server/drizzle`, `client/dist`; `USER node`; `HEALTHCHECK` por `fetch`; `CMD` migra e `exec` o server). O `.dockerignore` leva só o `package.json` do `e2e/` e do `desktop/`: o lockfile cita os dois workspaces.

## Pipeline (`.github/workflows/ci.yml`)

Roda **só** em `pull_request`: a `main` é protegida (PR + `ci-ok`), então um run no `push` do merge repetiria os mesmos checks. `permissions: contents: read`; `concurrency` por ref, cancelando o run antigo do PR. Todo job começa com `actions/checkout` + o composite `./.github/actions/setup` (pnpm pelo `packageManager`, Node pelo `.nvmrc`, cache do store, `pnpm install --frozen-lockfile` com `HUSKY=0`).

| Job                | Comando                                                                                                                                                                                                                                 | O que barra                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `quality`          | `lint`, `format:check`, `typecheck`, os 3 `autoteste.mjs` das skills                                                                                                                                                                    | estilo, formato, tipo (inclusive de spec), driver de skill quebrado |
| `test-packages`    | `pnpm test:packages`                                                                                                                                                                                                                    | regra do game-core, DTO do contracts                                |
| `test-client`      | `pnpm test:client`                                                                                                                                                                                                                      | lógica do client                                                    |
| `test-server`      | `pnpm test:server`                                                                                                                                                                                                                      | unit do server                                                      |
| `test-integration` | service `postgres:17-alpine` (tmpfs) + SeaweedFS (`./.github/actions/seaweedfs`) + Mailpit (`./.github/actions/mailpit`) → `pnpm db:migrate` → `pnpm test:integration`                                                                  | borda, DAO, migração quebrada, S3, entrega SMTP                     |
| `build`            | `pnpm build`                                                                                                                                                                                                                            | client ou server que não empacota                                   |
| `docker-image`     | service `postgres:17-alpine` + SeaweedFS + Mailpit → `docker/build-push-action` (`load: true`, cache `type=gha`) → `docker run --network host` com `NODE_ENV=production` → `bash infra/docker/smoke.sh lorkarium http://localhost:3333` | Dockerfile, bundle ou migração que não sobe; SPA não servida        |
| `e2e`              | matriz por grupo (`table`, `tokens`, `scene`, `combat`, `vision`, `lighting`, `library`, `account`), `fail-fast: false`: mesmo Postgres de serviço + SeaweedFS → `e2e:install` → `test:e2e --project=<grupo>` (15 min por grupo)        | client que não abre ou não alcança o server pelo proxy              |
| `desktop`          | `windows-latest`; `dorny/paths-filter` pula os passos sem mudança em `desktop/**`; `Swatinem/rust-cache` → `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` em `desktop/src-tauri`                        | Rust da casca (ver [`desktop.md`](desktop.md))                      |
| `ci-ok`            | `if: always()`, `needs` de todos; falha se algum `failure`/`cancelled`                                                                                                                                                                  | é o **único** check obrigatório da `main`                           |

O SMTP do `test-integration` é a action `.github/actions/mailpit` (`axllent/mailpit:v1.27.0`, SMTP 1025 e API 8025, espera do `/readyz`); só o `smtp-mailer.spec.ts` fala com ele, pelas `MAILPIT_SMTP_URL`/`MAILPIT_API_URL` do `env` do job. Nenhum job define `SMTP_URL`: o server cai no `LogMailer` (os specs passam um `MailerFake` ao `buildApp`), e o e2e força `SMTP_URL=` no `playwright.config.ts` (ver `server/mail.md`). O S3 dos dois jobs é a action composta `.github/actions/seaweedfs`: `docker run` do `chrislusf/seaweedfs:4.48` com dados em tmpfs, a identidade de `infra/compose/seaweedfs/s3.json` e espera do `/healthz` (até 60 s). É passo, e não `services:`, porque serviço do Actions não aceita comando e o volume do `s3.json` só existe depois do checkout. As `S3_*` ficam no `env` do job.

- `pnpm audit --prod --audit-level high` roda no `quality` com `continue-on-error`: informativo.
- O `coverage/` de cada job de teste sobe como artefato (`coverage-<camada>`, 7 dias), mesmo com teste vermelho.
- Falha no `e2e`: artefato `playwright-report-<grupo>` (relatório HTML + `test-results/` com o trace do retry; abrir com `pnpm --filter @lorkarium/e2e exec playwright show-trace <zip>`). Sem cache de navegador: o `--with-deps` instala as libs do SO de qualquer jeito.
- O e2e é dividido por **grupo nomeado** (projeto do Playwright), não por `--shard`: num worker a suíte inteira passava de 20 min e estourava o job. Os grupos ficam no `SPEC_GROUPS` de `e2e/playwright.config.ts`, balanceados pelo `test.setTimeout` dos specs. O config **recusa** spec fora de grupo, listado sem arquivo ou repetido (senão ele rodaria local e nunca no CI). Grupo novo entra também no `matrix.group` do `ci.yml`.
- **Job novo entra no `needs` do `ci-ok`**; senão ele roda mas não protege a `main`. Job pulado por `if:` conta como sucesso para o `ci-ok`.
- Action sempre fixada por SHA completo com `# vX.Y.Z` ao lado (o Dependabot atualiza os dois).
- **Release do desktop** fica fora do `ci.yml`: `.github/workflows/desktop-release.yml`, disparado por tag `desktop-v*` (ver [`desktop.md`](desktop.md), Lançar uma versão).
- Validar antes do push: `MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12 -no-color`.

Reproduzir um job localmente: o mesmo script da raiz. Para `test-integration`, o Postgres (5434), o SeaweedFS (8334) e o Mailpit (1026/8026) descartáveis da receita do `/testar` + `DATABASE_URL`, as `S3_*` e `NODE_ENV=test`, depois `pnpm db:migrate && pnpm test:integration`.

## Supply chain

- Actions fixadas por SHA completo (tag pode ser movida para código malicioso); o comentário `# vX.Y.Z` diz a versão.
- `.github/dependabot.yml`: `npm` (diretório `/`, semanal, grupos `dev-dependencies` e `production-dependencies` só para minor/patch; major vem em PR próprio) `github-actions` (semanal, um grupo, atualiza SHA e comentário juntos) e `cargo` (`/desktop/src-tauri`, semanal, um grupo minor/patch). Os três com `cooldown.default-days: 7`, a quarentena para a comunidade detectar release comprometida.
- `pnpm audit` é informativo (ver Pipeline).
- Proteção da `main` (configurada no GitHub, fora do repo): exigir PR e o check `ci-ok`. Só ele é obrigatório: um filtro por pasta (`paths:`) deixaria check obrigatório pendente para sempre, e o `ci-ok` permite ligar `dorny/paths-filter` depois sem travar PR.

## Hook local

`pnpm install` roda o `prepare` (`husky`), que aponta o `core.hooksPath` para `.husky/_`. O `.husky/pre-commit` chama o `lint-staged` (config no `package.json` da raiz), só nos arquivos _staged_:

- `*.{ts,tsx,js,mjs}` → `eslint --fix --no-warn-ignored` e `prettier --write`;
- `*.{json,md,css,yml,yaml}` → `prettier --write`.

Formato e erro corrigível são consertados dentro do commit; erro de ESLint sem correção automática (`any`, variável não usada) **barra** o commit. Os ignores do ESLint e do Prettier valem (`docs/pages/`, fixtures das skills). Teste e typecheck ficam no CI. Emergência: `git commit --no-verify` — o `quality` do CI barra do mesmo jeito.
