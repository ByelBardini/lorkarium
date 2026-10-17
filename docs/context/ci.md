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

| Job                | Comando                                                                                           | O que barra                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `quality`          | `lint`, `format:check`, `typecheck`, os 3 `autoteste.mjs` das skills                              | estilo, formato, tipo (inclusive de spec), driver de skill quebrado |
| `test-packages`    | `pnpm test:packages`                                                                              | regra do game-core, DTO do contracts                                |
| `test-client`      | `pnpm test:client`                                                                                | lógica do client                                                    |
| `test-server`      | `pnpm test:server`                                                                                | unit do server                                                      |
| `test-integration` | service `postgres:17-alpine` (tmpfs) → `pnpm db:migrate` → `pnpm test:integration`                | borda, DAO, migração quebrada                                       |
| `build`            | `pnpm build`                                                                                      | client ou server que não empacota                                   |
| `e2e`              | mesmo Postgres de serviço → `e2e:install` → `test:e2e`, que prepara o próprio `<db>_e2e` (15 min) | client que não abre ou não alcança o server pelo proxy              |
| `ci-ok`            | `if: always()`, `needs` de todos; falha se algum `failure`/`cancelled`                            | é o **único** check obrigatório da `main`                           |

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
- O server **nunca** é reaproveitado (`reuseExistingServer: false`): um `pnpm dev` de pé grava no banco de dev, então o e2e recusa com "http://localhost:3333/api/health is already used". Pare o `pnpm dev` antes. O client (Vite) ainda é reaproveitado fora do CI.
- **Banco próprio do e2e:** o `playwright.config.ts` troca o `DATABASE_URL` (do `server/.env` ou do ambiente) pelo mesmo com o sufixo `_e2e` (`lorkarium` → `lorkarium_e2e`), e o comando do `webServer` roda `pnpm --filter @lorkarium/server e2e:database` antes do `start`. Esse script (`server/test/support/prepare-e2e-database.ts` sobre `e2e-database.ts`) cria o banco se faltar, migra, **esvazia todas as tabelas** e semeia Bia e Caio; o admin vem do boot do server. Cada rodada começa limpa e o banco de dev não recebe nenhuma mesa. `e2eDatabaseName` recusa qualquer nome que não termine em `_e2e` (guarda provada em `server/test/support/e2e-database.spec.ts`). Basta o Postgres de pé (`pnpm db:up`).
- No CI: `forbidOnly`, `retries: 2`, `workers: 1`, `trace: 'on-first-retry'`, reporter `github` + `html` (`e2e/playwright-report/`).
- `e2e/test/smoke.spec.ts`: a home abre sem erro de página/console e `/api/health` responde 200 **pela origem do client** (prova proxy + server + banco).
- `e2e/test/home.spec.ts`: loga com o admin semeado, cria "Mesa E2E <timestamp>" (Tormenta20), vê "Mesa criada" com código `XXXX-XXXX`, acha a linha na lista, abre o modal, "Entrar na mesa" chega ao tabuleiro da sala e, de volta pelo "Mesas" do trilho, a faixa "Continuar" mostra a mesa.
- `e2e/test/table-presence.spec.ts`: dois `browser.newContext()`. O admin cria "Mesa ao vivo <timestamp>" e lê o código; Bia (do seed de dev) loga, entra pelo código e abre a mesa; o admin abre a mesa; no painel "Na mesa" de cada um o outro aparece "online". Bia fecha a página e, em até 10 s (tolerância de 5 s + margem), o admin a vê "offline". Critérios 5, 6 e 12 do §13.
- `e2e/test/open-tables.spec.ts`: dois `browser.newContext()`. O admin cria as mesas A e B; Bia entra nas duas pelo código e abre A, depois B; o admin abre A e vê Bia "online" (com o gateway antigo, de uma mesa por conexão, abrir B tirava Bia de A e o spec ficava vermelho aqui). O trilho de Bia mostra "Mesas abertas" com A e B. Bia dá F5 na B: o trilho volta com as duas e, passados 10 s (tolerância + margem), o admin ainda a vê "online". Botão direito em A no trilho → "Sair da mesa": o admin a vê "offline" em até 3 s (abaixo da tolerância, então é `session:leave` e não queda), e só B fica no trilho. `test.setTimeout(60_000)`, porque espera a tolerância de propósito.
- `e2e/test/board.spec.ts`: dois contextos. O admin cria a mesa e entra: o tabuleiro (`application` "Tabuleiro: Cena 1, 20 × 12 casas") tem canvas e largura, e o trilho está compacto (sem "Recolher/Expandir menu"). Bia entra pelo código; o admin configura 30 × 20 e o tabuleiro da Bia passa a "30 × 20 casas" sem recarregar. Ctrl+roda muda o zoom do toolbar e "Enquadrar cena" o devolve; F liga e desliga o modo foco; F5 do admin mantém 30 × 20.
- `e2e/test/tokens.spec.ts`: três contextos (admin, Bia e Caio do seed). O admin cria Lyra para a Bia com PV oculto e Inspiração; a Bia seleciona com `]` e move com a seta (anúncio no status), e o admin vê a casa nova no cartão; o Caio não vê o PV e, na seta, lê "Esse token não é seu."; a Bia aplica "−50" e o admin vê "−40 / 10"; o admin arrasta Lyra com o mouse (posição calculada depois do "Enquadrar cena"); F5 da Bia mantém tudo. `test.setTimeout(90_000)`.
- `e2e/test/layers.spec.ts`: três contextos. O admin aperta 2 (Objetos) e cria o Baú para o Caio: a Bia o vê, e o Caio, arrastando sobre ele, desenha um retângulo e o Baú fica; de volta em Tokens (1), o admin cria e posiciona Kael, Bram e Zed (do Caio); botão direito no Zed (menu "Ações de Zed") → Fundo e o Caio não o arrasta mais; o Caio desenha um retângulo sobre Kael e Bram ("2 selecionados") e arrasta o Kael: a Bia vê os dois na casa nova; F5 da Bia e do Caio mantém casas e camadas. A recusa de um arraste não gera evento, então o spec espera 500 ms antes de conferir que nada mudou. `test.setTimeout(240_000)`: três páginas desenhando PixiJS sem GPU passaram de 120 s no runner do CI (1,1 min local).
- `e2e/test/combat.spec.ts`: três contextos. O admin cria Kael (Bia), Lyra (Caio) e Goblin, inicia o combate e define 18, 14 e −2: os três veem a ordem Kael, Lyra, Goblin. O admin aplica "Atordoado 1" na Lyra; só a Bia vê "Passar a vez" e passa; o Caio passa a vez da Lyra e "Atordoado" fica (aplicada na rodada 1, só conta no fim do turno dela na rodada 2); o "Próximo turno" do admin leva os três à "Rodada 2 · Vez de Kael"; o Caio empata a Lyra em 18 e o admin usa ↑; F5 da Bia mantém rodada, vez e ordem; o admin encerra. `test.setTimeout(120_000)`.
- `e2e/test/drawings.spec.ts`: três contextos. A Bia desenha um quadrado preenchido e o admin o vê na lista oculta "Desenhos na cena" (o canvas não tem DOM); o admin o arrasta 3 casas e a Bia o vê lá, também depois do F5; o admin copia o Goblin (Ctrl+C, "1 item copiado.") e cola sob o cursor (Ctrl+V): os três veem dois Goblins; Ctrl+Z desfaz a colagem nos três; no Fundo o admin desenha e, de volta em Tokens, clicar e Delete não o apagam; o admin move o Goblin, o Caio o move depois e o Ctrl+Z do admin mostra "Alguém mexeu nisso depois; não dá para desfazer." com o Goblin onde o Caio deixou. `test.setTimeout(240_000)`.
- `e2e/test/support/board-cells.ts` — `cellCenterOf(page, col, row)` (ponto de tela do centro da casa depois do "Enquadrar cena", na cena padrão 20 × 12) e `dragBetweenCells(page, de, para)` (aperta, anda em 8 passos, solta). `e2e/test/support/token-cards.ts` — `statusOf`, `cardOf`, `openCard` e `createTokenFor(mestre, nome, jogador)`.
- `e2e/test/support/tables.ts` — os helpers de mesa compartilhados pelos specs de presença: `boardOf(page)`, `openRoomPeople(page)` (espera o tabuleiro e abre a aba "Na mesa", onde a presença está agora), `GRACE_AND_MARGIN_MS`, `presenceOf(page, nome)`, `createTableAndReadCode(admin, nome)`, `joinByCodeAndEnter(player, código)` e `enterFromTheList(page, nome)`.
- `e2e/test/support/player-pages.ts` — o `test` dos specs com várias pessoas: `newPlayerPage()` abre uma página num contexto próprio e a fixture fecha todos no fim do teste.
- `e2e/test/support/sign-in.ts` (`adminCredentials()`, `signIn(page, credenciais)`, compartilhados pelos specs; o primeiro login de cada e-mail no worker passa pelo formulário, os seguintes reaproveitam o cookie de sessão) e `dev-players.ts` (`BIA`, `CAIO`, as credenciais do `pnpm db:seed-dev`; mudam junto com o `dev-players-seed.bo.ts`).
- Credenciais: o spec lê `ADMIN_EMAIL`/`ADMIN_PASSWORD` do ambiente (o mesmo admin que o server semeia no boot). No CI o job `e2e` define um admin descartável no `env`; localmente o `playwright.config.ts` carrega o `server/.env` sem sobrescrever o que já está exportado.
- Local: o `webServer` reaproveita só o Vite da 5173. Um Vite antigo pode servir código velho.

## Armadilhas

- Tirar o `ws: true` do proxy do Vite **não** derruba o e2e de presença: o `socket.io-client` começa em long-polling HTTP, que passa pelo proxy comum, e só depois tenta o upgrade para websocket. O `ws: true` é o que permite o websocket; a prova de que o spec morde é quebrar a conversa (outro `path` no transporte do client), que deixa o painel sem participantes.

- No e2e, o "Entrar na mesa" do modal de detalhe tem homônimo na faixa "Continuar" da home (que aparece para quem já entrou numa mesa, como a Bia do seed depois da primeira rodada). Um `getByRole('button', { name: 'Entrar na mesa' })` solto pode resolver o da faixa antes de o modal abrir, e o clique fica interceptado pelo modal até o timeout. Escope ao diálogo: `page.getByRole('dialog').getByRole('button', …)`.
- `--coverage.include` é relativo à **pasta de cada projeto**, não à raiz: `src/**` funciona; `server/src/**` ou `packages/*/src/**` dão `Unknown% (0/0)` sem erro nenhum.
- Com algum teste vermelho o Vitest não imprime a cobertura; o relatório só sai com a suíte verde.
- `tsdown` sem `--config-loader tsx` quer o pacote `unrun` para ler o `tsdown.config.ts` (o Node 22.17 não remove tipos sozinho). O script `build` já passa a flag.
- Contexto aberto por `browser.newContext()` não é fechado pelo Playwright: com um worker (CI), as páginas dos specs anteriores seguem com socket e PixiJS ligados e deixam os seguintes lentos e intermitentes. Página de jogador nova é sempre pelo `newPlayerPage()`.
- O login aceita 5 tentativas por minuto por IP + e-mail: logar o admin pelo formulário em todo spec estoura o limite ("Muitas tentativas"). Por isso o `signIn` reaproveita o cookie.
