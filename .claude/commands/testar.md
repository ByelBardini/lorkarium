---
description: Escreve, completa ou audita os testes de um alvo de qualquer workspace (client/, server/, packages/game-core/, packages/contracts/) pela skill testar, somando a lente de cada um — no game-core, regra pura e determinística; no contracts, só o DTO com regra própria; no server, o que é unit (BO, mapper, service com fake de porta) e o que é integração (borda, DAO, permissão, isolamento por campanha); no client, sem DOM, componente e a conta do renderer. É o passo "escrever o teste primeiro" de cada fase do /planejamento e o "função extraída ganha teste" do /refatorar. Driver → cenários do contrato → vermelho → verde → prova de que o teste morde.
argument-hint: [spec, pasta de test/ ou arquivo/pasta de src/ — ex.: packages/game-core/src] [comportamento a provar, opcional — ex.: "o último da iniciativa fecha a rodada"]
allowed-tools: Skill, Read, Grep, Glob, Edit, Write, AskUserQuestion, Bash(node:*), Bash(pnpm:*), Bash(cp:*), Bash(sed:*), Bash(docker:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(ls:*), Bash(find:*)
---

# /testar — Testes de um alvo de qualquer workspace

O fluxo é o da skill `testar`: driver → contexto da área → cenários do contrato → triagem → escrever/corrigir → vermelho → verde → prova de que o teste morde → driver de novo → docs. Este comando acrescenta o que a skill não sabe sozinha: **em qual camada de teste cada coisa é provada** em cada workspace. A lente entra no passo 3 (qual cenário vira unit e qual vira integração) e no passo 6 (quando cada nível roda).

## Regras invioláveis

1. **O alvo precisa estar dentro de um workspace.** Alvo vazio → pergunte antes de qualquer coisa. Alvo que atravessa workspaces (um comando que nasce no client, passa pelo DTO e é decidido no server) → uma rodada por workspace, na ordem game-core → contracts → server → client, porque o server é a autoridade e o game-core é a regra que os dois usam.
2. **Tudo que a skill exige continua valendo**: todo `it` pode falhar; vermelho primeiro; cenário vem do contrato; fake nomeado; um cenário por `it`; nada muda em produção de passagem.
3. **Teste não corrige bug.** Cenário prometido e não cumprido vira `it` vermelho de regressão (com referência) e item separado. A correção é outra entrega; se veio de uma fase do `/planejamento`, é o passo 3 dela.
4. **Não há cobertura para perseguir.** O `@vitest/coverage-v8` não está instalado; a régua é a tabela de cenários. Nenhum `it` nasce para "pintar linha".

## Passo a passo

1. Invoque a skill com o alvo e o comportamento (se houver): `Skill(testar, args: "<alvo> <comportamento>")` e siga os sete passos dela.
2. Antes de abrir fonte, leia o doc da área que o cabeçalho do driver apontar (`leia antes:`) **e** a seção "Testes" do `AGENTS.md`.
3. No passo 3 da skill (cenários do contrato), acrescente a coluna **camada** a cada cenário usando a lente abaixo.
4. Os comandos (spec isolado, `--project`, prova de que morde por cópia no scratchpad, Postgres descartável) estão em "Verificação por workspace" da skill; a seção "Verificação" abaixo diz **quando** cada nível roda.

## Lente do game-core

| o que                                                    | camada | onde                                     | fake                                                                 |
| -------------------------------------------------------- | ------ | ---------------------------------------- | -------------------------------------------------------------------- |
| VO (posição, célula, HP, iniciativa)                     | unit   | `packages/game-core/test/<x>.vo.spec.ts` | nenhum; o construtor recusa citando o valor, a igualdade é por valor |
| Mecânica (turno, rodada, duração de condição, distância) | unit   | `packages/game-core/test/<x>.spec.ts`    | nenhum; entrada → saída                                              |

- **Determinismo é cenário**: a mesma entrada dá o mesmo resultado (é o que deixa server e client chegarem no mesmo estado). Instante, id e sorteio entram por parâmetro; o `it` fixa o valor no nome ("a condition of 2 rounds applied on round 3 expires at the start of round 5").
- **Regra independente de sistema de RPG** (spec §2.1): o cenário não presume D&D; "Atordoado" é marcador, não penalidade.

## Lente do contracts

| o que                                                           | camada | onde                                             | fake                                                                         |
| --------------------------------------------------------------- | ------ | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| DTO com `refine`, `superRefine`, `transform`, `check` ou `pipe` | unit   | `packages/contracts/test/<área>/<x>.dto.spec.ts` | nenhum; `safeParse` do que passa e do que é recusado (com o caminho do erro) |

- `z.string().min(1)` puro é testar o zod — não ganha spec. O que vale provar é a regra acrescentada e que `z.strictObject` recusa campo extra quando isso é segurança (um `userId` forjado no comando).

## Lente do server

| o que                                                                  | camada     | onde                                          | fake                                                                                                                                |
| ---------------------------------------------------------------------- | ---------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **BO** (regra do caso de uso, permissão)                               | unit       | `server/test/modules/<m>/<x>.bo.spec.ts`      | nenhum; PO de fábrica (`test/support/`) → decisão                                                                                   |
| **mapper** (PO → BO → DTO)                                             | unit       | `server/test/modules/<m>/<x>.mapper.spec.ts`  | nenhum; PO → DTO esperado escrito à mão                                                                                             |
| **service** (orquestração, ordem persistir → publicar)                 | unit       | `server/test/modules/<m>/<x>.service.spec.ts` | `class TokensDaoFake implements Pick<TokensDao, …>`, `class ClockFake implements ClockPort`, publicador falso que guarda os eventos |
| Porta e adaptador (`src/infrastructure/`)                              | unit       | `server/test/infrastructure/<porta>/`         | a lib de terceiro falsa; a porta, pelo contrato                                                                                     |
| **Borda HTTP** (`*.routes.ts`): DTO, status, erro → 4xx                | integração | `server/test/integration/<m>.spec.ts`         | nenhum: `app.inject()` no app real                                                                                                  |
| **Borda Socket.IO** (`*.gateway.ts`): payload, `ack`, evento publicado | integração | `server/test/integration/<m>.spec.ts`         | cliente `socket.io-client` real contra o app em porta efêmera                                                                       |
| **DAO**, PO e **isolamento por campanha**                              | integração | `server/test/integration/<m>.spec.ts`         | Postgres descartável: **"campanha B não vê a linha da campanha A"** é cenário obrigatório de todo dado de campanha                  |
| Autenticação e papel (mestre, jogador, espectador)                     | integração | `server/test/integration/<m>.spec.ts`         | sessão real; o cenário negativo (quem **não** pode) é o que prova a permissão                                                       |

- **Unit não sobe Fastify.** `new Service(fakes)` direto. O fake implementa o que a unidade usa e guarda o que recebeu em campo próprio (`this.saved`, `this.published`), para o `it` asserir com `toEqual` do argumento, não `toHaveBeenCalled`.
- **Ordem é cenário**: "a move is persisted before `token:moved` is published" se prova pela ordem gravada no fake.
- **Erro de domínio é asserido pelo código e pelo valor** (`toThrow(expect.objectContaining({ code: 'NOT_TOKEN_CONTROLLER' }))` e a mensagem citando o id), porque é isso que a borda traduz em status.
- **Integração é cara**: um cenário por regra de contrato (status, shape, isolamento, permissão, evento); a combinatória de valores fica no unit do BO e do game-core.

## Lente do client

| o que                                                                                                | camada     | onde                                       | fake                                                                                                |
| ---------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Lógica sem DOM (`src/lib/`)                                                                          | sem DOM    | `client/test/lib/<x>.spec.ts`              | nenhum                                                                                              |
| Store (Zustand): aplicar snapshot, evento confirmado, descartar evento de versão velha, prévia local | sem DOM    | `client/test/stores/<x>.spec.ts`           | nenhum; a store real                                                                                |
| Serviço (`src/services/`): valida resposta/evento pelo DTO, traduz falha                             | sem DOM    | `client/test/services/<x>.spec.ts`         | transporte falso nomeado (HTTP e socket), nunca `vi.fn()` em `globalThis.fetch`                     |
| Renderer: conta mundo ↔ tela, diff entre dois estados, o que recriar                                 | sem DOM    | `client/test/renderer/<x>.spec.ts`         | nenhum; sem `Application` nem WebGL                                                                 |
| Componente (`features/`, `components/`)                                                              | componente | `client/test/features/<área>/<x>.spec.tsx` | Testing Library + jsdom (`client/test/setup.ts`); fake nomeado do serviço em `client/test/support/` |

- **Asserção pelo que o usuário vê**: `getByRole`/`getByText` + `toHaveTextContent`/`toBeDisabled`, não `container.querySelector` nem classe CSS.
- **Callback de UI** prova os dois lados: dispara com os argumentos certos no cenário certo **e** não dispara no oposto.
- **`pnpm typecheck` é obrigatório em toda rodada**: o transpile do Vitest não checa tipo.

## Lente do e2e

| o que                                                                                | camada | onde                       | fake                                                                           |
| ------------------------------------------------------------------------------------ | ------ | -------------------------- | ------------------------------------------------------------------------------ |
| Fluxo que atravessa client + server + Postgres (smoke, login, proxy `/api`)          | e2e    | `e2e/test/<fluxo>.spec.ts` | nenhum: Chromium real, `webServer` do server e do client, Postgres descartável |
| Multiplayer: dois navegadores vendo o mesmo estado (critérios 5, 6 e 12 do spec §13) | e2e    | `e2e/test/<fluxo>.spec.ts` | dois `browser.newContext()`, um por usuário                                    |

- **Só o que precisa de ponta a ponta mora aqui**: regra, permissão, status e shape já estão provados no unit e na integração; o e2e prova que as peças conversam.
- **Morde pelo motivo certo**: com o server fora, o `it` fica vermelho por status/asserção, não por timeout de `goto`.
- O driver do `/testar` ainda não reconhece `e2e/` (exige `src/`); a auditoria aqui é manual, pela régua da skill.
- Rodar: `pnpm test:e2e` (com `DATABASE_URL` de um Postgres migrado); `CI=1` sobe o client por `vite build` + `vite preview`.

## Verificação

Os comandos exatos estão em "Verificação por workspace" da skill `testar`. Este comando decide **quando** cada nível roda:

1. **Sempre**: o spec isolado (vermelho, depois verde), a prova de que o teste morde, o driver no alvo com `--min aviso` sem achado novo, e `pnpm typecheck`.
2. **Antes de fechar a rodada**: `pnpm test` e `pnpm lint`.
3. **Integração do server só quando a fase tocou borda, DAO, PO, plugin ou permissão**, e sempre no Postgres descartável da receita — nunca no banco do `pnpm db:up`.

Teste vermelho que não é o que você acabou de escrever é a seção "Teste quebrou: entender antes de corrigir" da skill: classifique (regressão, mudança de contrato, frágil, ambiental) antes de tocar no spec.

## Docs

- Fábrica ou fake compartilhado que mudou (`test/support/`) → seção "Testes" do doc da área.
- Padrão de teste ruim corrigido → a seção "Armadilhas" do doc da área (`docs/context/<área>/armadilhas*.md` ou a seção no `<área>.md`).

## Alvo

$ARGUMENTS
