# Lorkarium

Virtual Tabletop (VTT) web para conduzir e gerenciar combates de RPG de mesa em tempo real.

O mestre monta cenas com mapas e grids, posiciona tokens, controla iniciativa, rodadas, pontos de vida e condições, e tudo é sincronizado com os jogadores conectados pelo navegador ou pelo app para Windows. O sistema é **agnóstico de regras**: não presume D&D, Pathfinder, Tormenta ou qualquer outro sistema específico.

> **Status:** as fases 0 a 6 do plano de implementação estão entregues, da fundação à imagem de produção com runbook de deploy. Parte das funcionalidades que a spec deixava para depois do MVP também já existe: visão por personagem com névoa, iluminação dinâmica e o aplicativo desktop.

A especificação completa está em [docs/spec.md](docs/spec.md).

## O que já funciona

**Mesas e pessoas**

- Mesas com código de entrada, papéis (mestre, jogador, espectador), configurações, capa e exclusão.
- Sessão ao vivo por Socket.IO: presença, ausência, várias mesas abertas por aba e reconexão com snapshot e versão de estado.
- Ficha da mesa por membro (personagem, CA, CD, anotações) e perfil da conta (apelido, cor, bio, foto).

**Tabuleiro**

- Várias cenas por mesa, em abas, com imagem de fundo, e uma biblioteca de grids em pastas (duplicar, ativar).
- Tabuleiro em PixiJS com câmera e zoom, camadas (tokens, objetos, fundo), desenhos, áreas de efeito, copiar/colar e desfazer/refazer.
- Paredes e portas (abrir, trancar), visão por token com névoa, cone de visão e luzes do mapa e dos tokens (cor, alcance, acesa/apagada).
- Ping no mapa, com a cor de cada pessoa.

**Tokens e combate**

- Tokens com imagem, barras configuráveis (com visibilidade por barra), controladores, token principal, invisibilidade para os jogadores e elenco de personagens.
- Combate com iniciativa, turnos, rodadas e grupos; condições configuráveis por mesa, com cor e stacks.

**Conta e administração**

- Login em duas etapas, sessão por cookie, 2FA por TOTP, troca de senha e de e-mail, sessões ativas, e-mail cifrado no banco e avisos de segurança por e-mail.
- Backoffice de contas: papel global, suspensão, exclusão, convite por link de uso único e nova senha pelo admin. Não há cadastro aberto: contas nascem por convite.

**Plataforma**

- Uma imagem Docker serve a SPA, a API e o Socket.IO na mesma origem e migra o banco ao subir.
- App para Windows (Tauri 2) que abre o site publicado, com atualização automática e ícone na bandeja.

## Princípios

- **Servidor autoritativo:** o cliente solicita operações; o servidor valida permissões, aplica, persiste e publica o estado confirmado.
- **Lógica separada da representação:** o motor de jogo (`game-core`) não depende de React, PixiJS, Fastify ou Socket.IO.
- **Independência de sistemas de RPG:** condições e regras são genéricas e configuráveis.
- **Segurança desde o início:** autenticação, autorização, validação de entrada e isolamento entre campanhas fazem parte da arquitetura base.
- **Simplicidade operacional:** monólito modular, uma única instância, implantável em uma VPS.
- **Desenvolvimento incremental:** entregas pequenas, funcionais e testáveis.

## Stack

| Camada    | Tecnologias                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend  | React 19, TypeScript, Vite 8, PixiJS 8, Zustand 5, Tailwind CSS v4, shadcn/ui, React Router 8, Socket.IO Client 4, Zod 4                      |
| Backend   | Node.js 22, TypeScript, Fastify 5, Socket.IO 4, Zod 4, PostgreSQL 17, Drizzle ORM, Pino, AWS SDK (S3), sharp, nodemailer, otpauth             |
| Desktop   | Tauri 2 + Rust; splash em TypeScript puro + Vite                                                                                              |
| Qualidade | Vitest 5, Playwright, Testing Library, ESLint 10, Prettier 3, TypeScript 6 strict, Husky + lint-staged                                        |
| Infra     | Docker (imagem multi-estágio), Docker Compose (Postgres, SeaweedFS, Mailpit), Coolify, VPS Linux, S3 da AWS, SMTP de produção, GitHub Actions |

## Estrutura do repositório

```text
lorkarium/
├── client/                 # SPA (React + Vite); tabuleiro PixiJS em src/renderer/
├── server/                 # API e tempo real (Fastify + Socket.IO + Drizzle); módulos em src/modules/
├── packages/
│   ├── contracts/          # DTOs Zod que atravessam client ↔ server (HTTP e Socket.IO)
│   ├── game-core/          # Regra de jogo pura: células, distância, turnos, condições, visão, luz
│   └── tsconfig/           # Configurações TypeScript compartilhadas
├── desktop/                # Casca Tauri 2 para Windows (splash em src/, Rust em src-tauri/)
├── e2e/                    # Testes ponta a ponta com Playwright
├── infra/
│   ├── compose/            # Postgres, SeaweedFS (S3) e Mailpit do ambiente local
│   └── docker/             # Smoke da imagem de produção
├── docs/
│   ├── spec.md             # Especificação do produto
│   ├── context/            # Documentação por área do que já existe
│   └── plans/              # Planos de implementação
├── .github/                # CI (GitHub Actions) e Dependabot
├── Dockerfile              # Imagem de produção
├── eslint.config.js
├── vitest.config.ts
└── pnpm-workspace.yaml
```

Os pacotes internos (`@lorkarium/contracts`, `@lorkarium/game-core`) são consumidos diretamente pelo código-fonte TypeScript, sem etapa de build própria; o build do server os coloca dentro do bundle.

## Pré-requisitos

- Node.js 22 LTS (>= 22.12)
- pnpm 11
- Docker Desktop aberto (Postgres, SeaweedFS e Mailpit locais)
- Só para o app desktop: Rust estável >= 1.90 e o MSVC Build Tools (C++)

## Primeiros passos

```bash
# instalar dependências
pnpm install

# variáveis de ambiente do servidor (os valores de dev já funcionam)
cp server/.env.example server/.env

# subir Postgres, SeaweedFS e Mailpit, migrar o banco e rodar client e server
pnpm dev
```

- Client: http://localhost:5173
- API: http://localhost:3333/api (o Vite encaminha `/api` para ela)
- Caixa de e-mail do Mailpit: http://localhost:8025

Para ter um admin, preencha `ADMIN_EMAIL` e `ADMIN_PASSWORD` no `server/.env` antes de subir: o server o cria no boot se o e-mail ainda não existir (em dev a senha pode ser curta). Para testar a mesa com mais gente, `pnpm db:seed-dev` cria os jogadores Bia (`@bia`) e Caio (`@caio`), com a senha `lorkarium-dev`.

## Scripts

Executados na raiz do repositório:

| Script                  | Descrição                                                                 |
| ----------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`              | Sobe a infra local, aplica as migrações e roda client e server            |
| `pnpm build`            | Gera o build de todos os pacotes que possuem build                        |
| `pnpm typecheck`        | Verifica tipos em todo o workspace (specs incluídos)                      |
| `pnpm lint`             | Executa o ESLint                                                          |
| `pnpm format`           | Formata o código com Prettier                                             |
| `pnpm format:check`     | Verifica a formatação sem alterar arquivos                                |
| `pnpm test`             | Testes (Vitest) de todos os projetos, sem a integração                    |
| `pnpm test:packages`    | Testes de game-core, contracts e da splash do desktop, com cobertura      |
| `pnpm test:client`      | Testes do client, com cobertura                                           |
| `pnpm test:server`      | Testes unitários do server, com cobertura                                 |
| `pnpm test:integration` | Testes de integração do server (exige Postgres)                           |
| `pnpm e2e:install`      | Baixa o Chromium do Playwright                                            |
| `pnpm test:e2e`         | Testes ponta a ponta (sobe server e client próprios; pare o `pnpm dev`)   |
| `pnpm bench`            | Benchmarks do tabuleiro e da visão (fora do `pnpm test` e do CI)          |
| `pnpm db:up`            | Sobe Postgres, SeaweedFS e Mailpit via Docker Compose                     |
| `pnpm db:down`          | Derruba os containers locais                                              |
| `pnpm db:generate`      | Gera o SQL de migração a partir das tabelas                               |
| `pnpm db:migrate`       | Aplica as migrações no `DATABASE_URL`                                     |
| `pnpm db:seed-dev`      | Cria os jogadores de teste Bia e Caio (recusa em produção)                |
| `pnpm db:seed-stress`   | Cria a "Mesa de estresse" da Bia no tamanho do bench (recusa em produção) |
| `pnpm mail:preview`     | Envia um exemplar de cada e-mail do sistema ao Mailpit                    |
| `pnpm desktop:dev`      | Abre a janela do app desktop sobre o `pnpm dev`                           |
| `pnpm desktop:build`    | Gera o instalador NSIS do app desktop                                     |

Para rodar um script em um pacote específico: `pnpm --filter @lorkarium/client <script>`. Um spec só: `pnpm exec vitest run <caminho>`.

Componentes do shadcn/ui são adicionados a partir de `client/`:

```bash
cd client
pnpm dlx shadcn@latest add button
```

## Testes

Cada workspace guarda seus specs em `<workspace>/test/`, espelhando `src/`. A regra de jogo e os DTOs são testados em unit puro; no server, BO, mapper e service em unit, e bordas, DAO, permissão e isolamento por campanha em integração com Postgres real. O client tem specs de componente com Testing Library, e o e2e roda no Chromium com banco e bucket próprios (`_e2e`), sem tocar nos de desenvolvimento. Localmente, prefira `pnpm test:e2e --workers=1`.

Antes de abrir um PR: `pnpm test && pnpm lint && pnpm typecheck`. O CI roda as mesmas camadas, o e2e por grupos e o build com smoke da imagem Docker (ver [docs/context/ci.md](docs/context/ci.md)).

## Deploy e app desktop

- **Produção:** Coolify numa VPS, Postgres 17 gerenciado pelo Coolify, assets num bucket S3 da AWS e e-mail por SMTP. O passo a passo, com todas as variáveis de ambiente, está em [docs/context/deploy.md](docs/context/deploy.md).
- **App para Windows:** casca Tauri que abre o site publicado; build, atualização e release em [docs/context/desktop.md](docs/context/desktop.md).

## Documentação

- [docs/spec.md](docs/spec.md): escopo, modelo de dados, API, eventos, segurança e fases do produto.
- [AGENTS.md](AGENTS.md): stack, layout, camadas do server e o índice de `docs/context/`, por área.
- [docs/context/](docs/context/): o detalhe de cada área do que já existe (é a fonte da verdade para quem mexe no código).
- [CLAUDE.md](CLAUDE.md): estilo de código, testes e regras para agentes de IA.
