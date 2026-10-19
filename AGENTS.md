# AGENTS.md — lorkarium

Leia este arquivo **antes** de explorar ou alterar o código. O produto está descrito em [`docs/spec.md`](docs/spec.md) (VTT de combate para RPG de mesa, independente de sistema, com servidor autoritativo). O detalhe por área do que já existe fica em [`docs/context/`](docs/context/) — abra só o arquivo relevante para a tarefa. Estilo e comportamento do agente: `CLAUDE.md`.

## Stack

| Workspace            | Tecnologias                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client/`            | React 19, Vite 8, TypeScript, Tailwind v4 (`@tailwindcss/vite`), shadcn/ui (estilo `radix-nova`, sobre `radix-ui`, ícones `lucide-react`), React Router 8, PixiJS 8 (tabuleiro), Zustand 5 (estado), Socket.IO Client 4, Zod 4                                                                                                 |
| `server/`            | Node 22, Fastify 5, Socket.IO 4, Drizzle ORM 0.45 + `pg` (PostgreSQL 17), Pino 10, Zod 4, `@aws-sdk/client-s3` 3 (assets num S3 compatível; SeaweedFS no dev), `sharp` 0.35 (normaliza a imagem enviada), `tsx` (dev), `tsdown` (build → `server/dist/`), `drizzle-kit` (`server/drizzle.config.ts`, SQL em `server/drizzle/`) |
| `packages/game-core` | TypeScript puro, sem dependência: regra de jogo usada pelo server e pelo client                                                                                                                                                                                                                                                |
| `packages/contracts` | DTOs em Zod 4 (o que atravessa client ↔ server por HTTP e Socket.IO)                                                                                                                                                                                                                                                           |
| `packages/tsconfig`  | `base.json` (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), `node.json`, `react.json`                                                                                                                                                                                                                            |
| Ferramentas          | pnpm 11 workspaces, TypeScript 6, ESLint 10 (flat config na raiz), Prettier 3 (+ plugin do Tailwind), Vitest 5 (`projects` na raiz), Husky + lint-staged (pre-commit), Docker Compose                                                                                                                                          |

## Layout do repositório

```
client/                  # Front React + Vite (dev em http://localhost:5173); alias @/* → src/*
client/src/lib/utils.ts  # O `cn` gerado pelo shadcn (aliases do components.json)
server/                  # API Fastify (PORT 3333, rotas sob /api); encanamento em src/{app,config,database}/
packages/game-core/      # Regra de jogo pura (coordenadas, células, distância, turnos, condições)
packages/contracts/      # DTOs Zod compartilhados
packages/tsconfig/       # tsconfigs base
e2e/                     # @lorkarium/e2e: Playwright (playwright.config.ts sobe server + client), specs em e2e/test/
.github/                 # CI: workflows/ci.yml, actions/setup (composite), dependabot.yml
infra/compose/compose.yaml # Postgres 17 (5432, usuário/senha/db lorkarium) e SeaweedFS/S3 (8333, identidade em seaweedfs/s3.json) de desenvolvimento (pnpm db:up)
docs/spec.md             # Planejamento e arquitetura do produto (escopo, modelo, API, eventos, segurança, fases)
docs/context/            # Memória do projeto para agentes de IA: <area>.md é o índice, <area>/ o detalhe
docs/plans/              # Planos do /planejamento, /construir-tela e /refatorar
.claude/commands/        # /commit, /planejamento, /atualizar-contexto, /melhorar-skills, /construir-tela, /refatorar-server, /refatorar-client, /testar
.claude/skills/refatorar/          # /refatorar <alvo>: driver de diagnóstico estático do monorepo inteiro + refatoração em fases
.claude/skills/testar/             # /testar <alvo>: driver de auditoria dos specs + cenários do contrato → vermelho → verde → prova de que morde
.claude/skills/desenvolver-server/ # /desenvolver-server <pedido>: fatia nova do server camada por camada, com driver de conferência de camadas
```

Pastas que **ainda não existem**, mas têm lugar definido (spec §10 e as skills): `client/src/renderer/`. O Socket.IO do server vive em `server/src/realtime/` (ver `docs/context/server.md`, Tempo real).

Comandos da raiz (`package.json`):

- `pnpm dev` — sobe o Postgres e o SeaweedFS (`db:up`, espera os healthchecks), aplica as migrações e roda client e server em paralelo (exige o Docker Desktop aberto)
- `pnpm build` / `pnpm typecheck` — em todos os workspaces
- `pnpm test` — Vitest de todos os workspaces, sem a integração do server · `pnpm test:integration` — só `server/test/integration/` (exige Postgres; receita no `/testar`) · `pnpm test:packages` / `test:client` / `test:server` — uma camada, com cobertura (ver `docs/context/ci.md`) · `pnpm exec vitest run <spec>` — um spec · `pnpm exec vitest run --project @lorkarium/<nome>` — um workspace
- `pnpm lint` · `pnpm format` · `pnpm format:check`
- `pnpm db:up` / `pnpm db:down` — Postgres e SeaweedFS (S3) de desenvolvimento · `pnpm db:generate` — SQL de migração a partir dos PO · `pnpm db:migrate` — aplica as migrações no `DATABASE_URL` · `pnpm db:seed-dev` — jogadores de teste Bia e Caio (senha `lorkarium-dev`; recusa em produção)

## Camadas do server

O vocabulário segue o artigo [Diferença entre os patterns PO, POJO, BO, DTO e VO](https://www.devmedia.com.br/diferenca-entre-os-patterns-po-pojo-bo-dto-e-vo/28162) (DevMedia). O papel de cada arquivo está no sufixo do nome; detalhe, ordem de escrita e o que é pergunta em `.claude/skills/desenvolver-server/SKILL.md`.

| Sufixo                         | Camada                                                                                   | Onde                      |
| ------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------- |
| `*.dto.ts`                     | **DTO**: o que atravessa client ↔ server (schema Zod estrito + tipo inferido), sem regra | `packages/contracts`      |
| `*.vo.ts`                      | **VO**: valor imutável, sem identidade, comparado pelo valor (posição, célula, HP)       | `packages/game-core`      |
| `*.po.ts`                      | **PO**: a linha persistida (tabela Drizzle + `$inferSelect`/`$inferInsert`), sem regra   | `server/src/modules/<m>/` |
| `*.dao.ts`                     | **DAO**: consulta Drizzle; recebe `db`/`tx` pelo construtor; devolve PO                  | idem                      |
| `*.bo.ts`                      | **BO**: regra do caso de uso, construída a partir de PO convertido; sem I/O nem relógio  | idem                      |
| `*.mapper.ts`                  | conversões PO → BO → DTO                                                                 | idem                      |
| `*.service.ts`                 | orquestra DAO + mapper + BO + porta; persiste antes de confirmar                         | idem                      |
| `*.routes.ts` / `*.gateway.ts` | bordas HTTP (Fastify) e Socket.IO: valida o DTO, autor da sessão, delega                 | idem                      |
| `*.port.ts`                    | contrato de I/O (interface); adaptador em `server/src/infrastructure/`                   | idem                      |
| `*.plugin.ts`                  | fiação do módulo, registrada em `server/src/app/`                                        | idem                      |
| `*.error.ts`                   | erro de domínio com código e o valor recebido                                            | idem                      |

## Contexto por área (`docs/context/`)

Uma linha por **hub**; o detalhe mora no arquivo, não nesta tabela. O hub de um workspace tem o nome dele (`server.md`, `client.md`, `game-core.md`, `contracts.md`) e o de uma área, o nome da pasta dela no código (`combat.md`, `board.md`) — é assim que os drivers montam o `leia antes:`.

| Área         | O que cobre                                                      | Arquivo                                                        |
| ------------ | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| contracts    | DTOs Zod compartilhados (auth, mesas, sessão, tabuleiro, erro)   | [`docs/context/contracts.md`](docs/context/contracts.md)       |
| game-core    | Regra de jogo pura: célula, distância, barra, turno, visão, luz  | [`docs/context/game-core.md`](docs/context/game-core.md)       |
| server       | Encanamento: env, banco, migrações, app, unit × integração       | [`docs/context/server.md`](docs/context/server.md)             |
| auth         | Contas, login, sessão por cookie, papel global (server + client) | [`docs/context/auth.md`](docs/context/auth.md)                 |
| campaigns    | Mesas: criação, participação, lista, detalhe, entrada por código | [`docs/context/campaigns.md`](docs/context/campaigns.md)       |
| board        | Tabuleiro: cena (grid), versão por cena, depois tokens e combate | [`docs/context/board.md`](docs/context/board.md)               |
| tokens       | Tokens da cena: tamanho, barras, controle, redação, camadas      | [`docs/context/tokens.md`](docs/context/tokens.md)             |
| combat       | Condições e combate: entradas em grupo, turno, rodada, duração   | [`docs/context/combat.md`](docs/context/combat.md)             |
| drawings     | Desenhos da cena: formas, cor, dono, camada, lote e precondição  | [`docs/context/drawings.md`](docs/context/drawings.md)         |
| effect-areas | Áreas de efeito: formas, casas pintadas, autor, alças, versão    | [`docs/context/effect-areas.md`](docs/context/effect-areas.md) |
| walls        | Paredes e portas: tipos, formas, passagem, porta vista, visão    | [`docs/context/walls.md`](docs/context/walls.md)               |
| lights       | Luzes do mapa: ponto, alcance, aceso/apagado, só o mestre        | [`docs/context/lights.md`](docs/context/lights.md)             |
| sessions     | Sessão ao vivo da mesa (Socket.IO): presença, snapshot, versão   | [`docs/context/sessions.md`](docs/context/sessions.md)         |
| assets       | Imagens da mesa: S3, envio, link seguro, leitura pela origem     | [`docs/context/assets.md`](docs/context/assets.md)             |
| client       | SPA: estrutura, rotas, shell e home, testes, design system       | [`docs/context/client.md`](docs/context/client.md)             |
| ci           | Testes por camada, cobertura, build, pipeline do GitHub Actions  | [`docs/context/ci.md`](docs/context/ci.md)                     |
| health       | `GET /api/health` (ping no Postgres, 200/503, pública)           | [`docs/context/health.md`](docs/context/health.md)             |

Área sem linha aqui ainda não tem doc: o `/atualizar-contexto` cria o hub junto com o primeiro código da área. Até lá, a referência é o `docs/spec.md`.

## Testes

- Vitest em todo workspace, rodado da raiz. Specs em `<workspace>/test/` espelhando `src/`; integração do server em `server/test/integration/`; fábricas e fakes em `<workspace>/test/support/`.
- O que é provado onde: game-core e contracts em unit puro; no server, BO, mapper e service em unit (sem banco, sem Fastify, portas por fake nomeado) e borda, DAO, permissão e isolamento por campanha em integração (Postgres descartável, nunca o do `pnpm db:up`); no client, `src/lib/`, stores, serviços e a conta do renderer sem DOM, e `components/`/`features/` como spec de componente. Detalhe por workspace em `.claude/commands/testar.md`.
- Cobertura por `@vitest/coverage-v8`, só relatório (sem limiar), nos scripts por camada. Spec de componente no client com Testing Library (`react`, `user-event`, `jest-dom`) sobre `jsdom` (setup em `client/test/setup.ts`). E2E com Playwright (só Chromium) em `e2e/test/`, por `pnpm test:e2e` (ver `docs/context/ci.md`).

## Checklist rápido antes de editar

1. Achar o workspace e a área do pedido; ler o `docs/context/<área>.md` (ou a seção do `docs/spec.md`) antes de qualquer fonte.
2. Regra de jogo que o client também calcula → `packages/game-core`. Forma de dado que atravessa a rede → `packages/contracts`. Decisão de permissão e caso de uso → BO do módulo no server.
3. Server: a camada está no sufixo do arquivo (tabela acima); feature nova = pasta em `server/src/modules/` com plugin próprio registrado em `server/src/app/`. Conferir com `node .claude/skills/desenvolver-server/driver.mjs <alvo>`.
4. Client: tabuleiro no renderer PixiJS (`src/renderer/`, sem React); rede em `src/services/`; estado confirmado × local em `src/stores/`; tela em `src/features/<área>/`. Rota do React Router 8: ler `client/node_modules/react-router/docs/` antes.
5. Env var nova: schema Zod em `server/src/config/`, `server/.env.example`, e o valor recebido por parâmetro — nunca `process.env` fora de lá e de `src/index.ts`.
6. Antes de finalizar: `pnpm test && pnpm lint && pnpm typecheck`.
