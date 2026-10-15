# Lorkarium

Virtual Tabletop (VTT) web para conduzir e gerenciar combates de RPG de mesa em tempo real.

O mestre monta cenas com mapas e grids, posiciona tokens, controla iniciativa, rodadas, pontos de vida e condições, e tudo é sincronizado com os jogadores conectados pelo navegador. O sistema é **agnóstico de regras**: não presume D&D, Pathfinder, Tormenta ou qualquer outro sistema específico.

> **Status:** Fase 0 — fundação. O repositório contém apenas o esqueleto do monorepo e as dependências instaladas; nenhuma funcionalidade foi implementada ainda.

A especificação completa está em [docs/spec.md](docs/spec.md).

## Princípios

- **Servidor autoritativo:** o cliente solicita operações; o servidor valida permissões, aplica, persiste e publica o estado confirmado.
- **Lógica separada da representação:** o motor de jogo (`game-core`) não depende de React, PixiJS, Fastify ou Socket.IO.
- **Independência de sistemas de RPG:** condições e regras são genéricas e configuráveis.
- **Segurança desde o início:** autenticação, autorização, validação de entrada e isolamento entre campanhas fazem parte da arquitetura base.
- **Simplicidade operacional:** monólito modular, uma única instância no MVP, implantável em uma VPS.
- **Desenvolvimento incremental:** entregas pequenas, funcionais e testáveis.

## Stack

| Camada    | Tecnologias                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| Frontend  | React, TypeScript, Vite, PixiJS v8, Zustand, Tailwind CSS v4, shadcn/ui, React Router, Socket.IO Client, Zod |
| Backend   | Node.js, TypeScript, Fastify, Socket.IO, Zod, PostgreSQL, Drizzle ORM, Pino                                  |
| Qualidade | Vitest, ESLint, Prettier, TypeScript strict                                                                  |
| Infra     | Docker, Docker Compose, Coolify, VPS Linux, Cloudflare, armazenamento S3 compatível, GitHub Actions          |

## Estrutura do repositório

```text
lorkarium/
├── client/                 # Frontend (React + Vite + PixiJS)
├── server/                 # Backend (Fastify + Socket.IO + Drizzle)
├── packages/
│   ├── contracts/          # Schemas Zod e tipos compartilhados (comandos, eventos, DTOs)
│   ├── game-core/          # Regras de domínio puras: coordenadas, grid, turnos, condições
│   └── tsconfig/           # Configurações TypeScript compartilhadas
├── infra/
│   └── compose/            # Docker Compose do ambiente local (PostgreSQL)
├── docs/                   # Especificação e documentação técnica
├── eslint.config.js
├── vitest.config.ts
└── pnpm-workspace.yaml
```

Os pacotes internos (`@lorkarium/contracts`, `@lorkarium/game-core`) são consumidos diretamente pelo código-fonte TypeScript, sem etapa de build própria.

## Pré-requisitos

- Node.js 22 LTS (>= 22.12)
- pnpm 11
- Docker (para o PostgreSQL local)

## Primeiros passos

```bash
# instalar dependências
pnpm install

# subir o PostgreSQL local
pnpm db:up

# variáveis de ambiente do servidor
cp server/.env.example server/.env

# rodar client e server em modo de desenvolvimento
pnpm dev
```

- Client: http://localhost:5173
- Server: http://localhost:3333

## Scripts

Executados na raiz do repositório:

| Script                  | Descrição                                                         |
| ----------------------- | ----------------------------------------------------------------- |
| `pnpm dev`              | Inicia client e server em paralelo                                |
| `pnpm build`            | Gera o build de todos os pacotes que possuem build                |
| `pnpm typecheck`        | Verifica tipos em todo o workspace                                |
| `pnpm lint`             | Executa o ESLint                                                  |
| `pnpm test`             | Executa os testes (Vitest) de todos os projetos, sem a integração |
| `pnpm test:packages`    | Testes de game-core e contracts, com cobertura                    |
| `pnpm test:client`      | Testes do client, com cobertura                                   |
| `pnpm test:server`      | Testes unitários do server, com cobertura                         |
| `pnpm test:integration` | Testes de integração do server (exige Postgres)                   |
| `pnpm format`           | Formata o código com Prettier                                     |
| `pnpm format:check`     | Verifica a formatação sem alterar arquivos                        |
| `pnpm db:up`            | Sobe o PostgreSQL via Docker Compose                              |
| `pnpm db:down`          | Derruba os containers locais                                      |

Para rodar um script em um pacote específico: `pnpm --filter @lorkarium/client <script>`.

Componentes do shadcn/ui são adicionados a partir de `client/`:

```bash
cd client
pnpm dlx shadcn@latest add button
```

## Roadmap

| Fase | Objetivo                                                             | Entrega                        |
| ---- | -------------------------------------------------------------------- | ------------------------------ |
| 0    | Fundação: monorepo, tooling, health check, conexão entre navegadores | Ambiente funcional             |
| 1    | Protótipo do grid: canvas, câmera, zoom, tokens arrastáveis com snap | Tabuleiro local interativo     |
| 2    | Sincronização multiplayer: sessões, rooms, snapshot e reconexão      | Tabuleiro multiplayer          |
| 3    | Persistência: PostgreSQL, Drizzle, migrations, autenticação          | Campanhas e cenas persistentes |
| 4    | Combate: iniciativa, turnos, rodadas, HP e condições                 | Sistema de combate utilizável  |
| 5    | Interface do mestre: painéis, tracker, bibliotecas, visão do jogador | Experiência integrada          |
| 6    | Publicação: Docker de produção, VPS, HTTPS/WSS, backups, logs        | MVP público                    |

Detalhes de cada fase, modelo de dados, API e critérios de conclusão do MVP estão em [docs/spec.md](docs/spec.md).
