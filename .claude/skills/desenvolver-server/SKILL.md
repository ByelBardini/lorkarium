---
name: desenvolver-server
description: Implementa uma fatia nova do server (Fastify + Drizzle + Socket.IO) nas camadas fixas do projeto — DTO em packages/contracts, VO em packages/game-core, e no módulo do server PO (tabela Drizzle), DAO, BO, mapper, service, routes (HTTP), gateway (Socket.IO), port e plugin — na ordem certa, com o driver de conferência provando que cada arquivo ficou na camada certa, que nenhuma seta aponta para trás e que a fatia terminou de ser ligada. Pergunta antes de qualquer coisa que saia do padrão (tabela nova, env var, lib de terceiro, mudança de contrato, rota sem autenticação, dado sem isolamento por campanha). Use quando o usuário pedir para implementar, criar ou adicionar endpoint, evento, módulo, campo, regra, consulta ou feature no backend/server.
argument-hint:
  [o que implementar + o módulo alvo — ex.: 'mover token por evento em server/src/modules/tokens']
allowed-tools: Read, Grep, Glob, Edit, Write, AskUserQuestion, Bash(node:*), Bash(pnpm:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(ls:*), Bash(find:*)
---

# /desenvolver-server — Uma fatia do server, camada por camada

O pedido chega em `$ARGUMENTS`. Esta skill constrói **código novo** no `server/` (e nos pacotes que a fatia toca: o DTO em `packages/contracts`, o VO em `packages/game-core`) dentro de uma arquitetura fixa: o papel de cada arquivo está no **sufixo do nome**, a direção dos imports é fixa e nada disso é negociável no meio de uma entrega. A conferência é de `.claude/skills/desenvolver-server/driver.mjs` (Node puro sobre o `typescript` da raiz, reaproveitando a lib da skill `refatorar`): ele diz se cada arquivo ficou na camada certa, se alguma seta apontou para trás e se a fatia terminou de ser ligada. Todo caminho abaixo é relativo à **raiz do repositório**.

Para refatorar o que já existe é `/refatorar-server`; para escrever os testes é `/testar`. Esta aqui é a de **construir**.

## Regras invioláveis

1. **Contexto antes de código.** Leia `docs/context/server.md` e o `docs/context/<área>.md` que o cabeçalho do driver apontar (`leia antes:`) **antes** de abrir qualquer fonte. Sem doc da área, a seção correspondente de `docs/spec.md` (§3 escopo, §5 arquitetura, §6 modelo, §7 API e eventos, §8 segurança).
2. **A camada está no nome do arquivo.** `*.po.ts`, `*.dao.ts`, `*.bo.ts`, `*.mapper.ts`, `*.service.ts`, `*.routes.ts`, `*.gateway.ts`, `*.port.ts`, `*.plugin.ts`, `*.error.ts` no módulo; `*.dto.ts` só em `packages/contracts`; `*.vo.ts` só em `packages/game-core`. Arquivo que não couber em nenhuma dessas é **pergunta para o usuário**, não sufixo novo.
3. **O servidor é a autoridade** (spec §2.2, §5.4). O client pede; o server valida o DTO, confere quem pede (pela sessão, **nunca pelo payload**), aplica a regra, **persiste antes de confirmar** e só então publica o evento com a versão do estado.
4. **Pergunte antes de sair do padrão.** A lista está em [Quando parar e perguntar](#quando-parar-e-perguntar). Nessas horas o produto é uma pergunta com `AskUserQuestion`, não uma decisão sua.
5. **Regra nasce com spec, vermelho primeiro.** Todo `*.bo.ts`, todo `*.vo.ts` e todo DTO com `refine`/`transform` ganham spec em `<workspace>/test/` espelhando `src/`, escrito pelo `/testar <arquivo>`. É o teste mais barato do repo e é onde o comportamento é provado — sem banco e sem Fastify.
6. **Nada de lib de terceiro solta.** Dependência nova entra por porta (`interface XPort` no módulo) com **um** adaptador em `src/infrastructure/`. E a lib nova em si é pergunta (regra 4).
7. **Docs acompanham.** Endpoint, evento, DTO, tabela, env var ou estrutura que mudou → atualize `docs/context/<área>.md` (ou rode `/atualizar-contexto`). Padrão errado que você corrigiu → seção "Armadilhas" da área.

## O vocabulário das camadas

As siglas seguem o artigo [Diferença entre os patterns PO, POJO, BO, DTO e VO](https://www.devmedia.com.br/diferenca-entre-os-patterns-po-pojo-bo-dto-e-vo/28162) (DevMedia), traduzido para TypeScript + Drizzle:

| sigla                          | o que é aqui                                                                                                                                                 | onde mora                                  | não contém                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| **POJO**                       | a base de todos: objeto simples, sem framework (no TS, tipo ou objeto literal). Vira PO na persistência, DTO na transmissão, VO na apresentação              | —                                          | —                                          |
| **PO** (Persistent Object)     | a linha como o banco a guarda: a tabela do Drizzle (`pgTable`) e os tipos `$inferSelect` / `$inferInsert`                                                    | `server/src/modules/<m>/<m>.po.ts`         | regra, consulta, transação                 |
| **DAO**                        | acesso a dado: consultas Drizzle que recebem e devolvem **PO**. Recebe o `db`/`tx` pelo construtor                                                           | `<m>.dao.ts`                               | regra de negócio, DTO                      |
| **BO** (Business Object)       | a regra de negócio do caso de uso, construída a partir de um ou mais PO **já convertidos** (o PO não é o BO). Decide e devolve decisão ou novo estado        | `<m>.bo.ts`                                | I/O, `async`, relógio, banco, socket, HTTP |
| **DTO** (Data Transfer Object) | o que atravessa client ↔ server (body, resposta, comando e evento Socket.IO): schema Zod estrito + tipo inferido                                             | `packages/contracts/src/<área>/<x>.dto.ts` | regra de negócio                           |
| **VO** (Value Object)          | valor pequeno, imutável, comparado pelo valor e sem identidade (posição no grid, célula, HP, iniciativa); nasce por um construtor que recusa citando o valor | `packages/game-core/src/<x>.vo.ts`         | `id`, mutação, relógio                     |

E as camadas que não são sigla do artigo:

| camada                 | papel                                                                                                                                       | onde mora                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **mapper**             | as conversões: PO → BO, BO/PO → DTO, DTO → valores para o BO. Funções puras                                                                 | `<m>.mapper.ts`                                            |
| **service**            | orquestra: lê pelo DAO, converte pelo mapper, decide pelo BO, grava pelo DAO, chama portas, e devolve DTO                                   | `<m>.service.ts`                                           |
| **routes**             | borda HTTP (plugin Fastify): valida o DTO, pega o autor da sessão, chama o service, traduz erro de domínio em status                        | `<m>.routes.ts`                                            |
| **gateway**            | borda Socket.IO: valida o payload pelo DTO, pega o autor de `socket.data`, chama o service, responde no `ack` e publica o evento confirmado | `<m>.gateway.ts`                                           |
| **port**               | contrato de I/O que não é banco (storage S3, relógio, gerador de id, hash de senha): só `interface`                                         | `<m>.port.ts` (adaptador em `src/infrastructure/<porta>/`) |
| **plugin**             | a fiação do módulo: monta DAO e service com o que o app entrega (db, portas) e registra as bordas                                           | `<m>.plugin.ts`, registrado em `src/app/`                  |
| **error**              | erro de domínio com código e mensagem citando o valor recebido e a forma esperada                                                           | `<m>.error.ts`                                             |
| regra de jogo genérica | mecânica independente de sistema de RPG (ordem de turno, duração de condição, distância): o game-core é usado pelo server **e** pelo client | `packages/game-core/src/<x>.ts`                            |

Pastas transversais do server (o "encanamento", fora da matriz de camadas): `src/app/` (monta o Fastify e registra os plugins), `src/config/` (schema Zod do env), `src/database/` (cliente Drizzle, transação, schema que junta os PO), `src/realtime/` (servidor Socket.IO, autenticação da conexão, rooms), `src/infrastructure/` (adaptadores das portas), `src/lib/` (genérico sem domínio).

### O caminho de um comando

```
client ──DTO──► gateway/routes ──► service ──► DAO ──► banco
                (valida DTO,         │           │
                 autor da sessão)    │◄── PO ────┘
                                     ├─► mapper: PO → BO
                                     ├─► BO decide (usa VO e regra do game-core)
                                     ├─► DAO grava (persiste ANTES de confirmar)
                                     └─► mapper: BO/PO → DTO ──► ack + evento com versão
```

O molde vivo é o módulo `server/src/modules/auth/` (doc em `docs/context/auth.md`): PO, DAO, BO, mapper, service, routes, port, plugin e error, com adaptadores em `src/infrastructure/`, unit em `server/test/modules/auth/` e integração em `server/test/integration/auth*.spec.ts`; passa no driver com zero achado. Ele não tem gateway nem dado de campanha: para essas duas camadas, a referência continua sendo o módulo `campaigns` da fixture (`.claude/skills/desenvolver-server/fixtures/monorepo/server/src/modules/campaigns/`).

## Pré-requisitos

Node 22 (`.nvmrc`) e `pnpm install` feito na raiz. O driver carrega o `typescript` da raiz; não instala nada e não escreve nada.

## Passo a passo

### 1. Fixar o pedido e ler o contexto

Se `$ARGUMENTS` estiver vazio, pergunte o que implementar e em qual módulo. Rode o driver no módulo alvo **antes de escrever qualquer coisa** — ele imprime o `leia antes:` e o inventário de camadas que já existem ali:

```bash
node .claude/skills/desenvolver-server/driver.mjs server/src/modules/<modulo>
```

Módulo que ainda não existe: rode em `server` e leia `docs/context/server.md` e a linha da área na tabela do `AGENTS.md`.

### 2. Desenhar a fatia antes de escrever

Monte a tabela da fatia — uma linha por arquivo, dizendo **camada, nome e o que ele decide** — e o caminho do comando (quem chama quem). Reaproveite o que já existe: VO e regra do game-core, DTO do contracts, BO que já decide, DAO que já consulta, mapper que já converte. Duplicar regra é o erro mais caro aqui, porque as duas cópias divergem na primeira mudança — e regra de jogo duplicada entre client e server faz os dois verem estados diferentes.

Passe a fatia inteira pela lista de [Quando parar e perguntar](#quando-parar-e-perguntar). **Pergunte tudo de uma vez, agora** — não no meio da implementação.

### 3. Escrever na ordem das camadas

De dentro para fora, porque cada passo só depende do anterior:

1. **VO** (`packages/game-core`) e **DTO** (`packages/contracts`) — o valor do domínio e a forma do que atravessa a rede. VO e DTO com regra própria ganham spec pelo `/testar`.
2. **PO** — a tabela Drizzle e os tipos inferidos. Tabela nova é migração, e migração é pergunta.
3. **BO + spec** — a regra. O spec vem pelo `/testar server/src/modules/<m>/<arquivo>.bo.ts`: cenários do contrato (feliz, borda, erro, **permissão** e **isolamento por campanha**), **vermelho primeiro**, e a prova de que o `it` morde.
4. **DAO** — a consulta, com `db`/`tx` recebidos pelo construtor. Toda consulta de dado de campanha filtra pela campanha da sessão (spec §2.6).
5. **Mapper** — PO → BO e PO/BO → DTO.
6. **Service** — a orquestração e a ordem que a spec exige (persistir, depois confirmar).
7. **Borda** — `*.routes.ts` (HTTP) e/ou `*.gateway.ts` (Socket.IO): DTO na entrada, autor da sessão, uma chamada ao service, tradução do erro.
8. **Plugin** — monta DAO e service e registra as bordas; o plugin entra em `src/app/`.

### 4. Conferir a fatia com o driver

```bash
node .claude/skills/desenvolver-server/driver.mjs server/src/modules/<modulo> --min aviso
node .claude/skills/desenvolver-server/driver.mjs packages/contracts --min aviso
node .claude/skills/desenvolver-server/driver.mjs packages/game-core --min aviso
```

Variações verificadas:

```bash
node .claude/skills/desenvolver-server/driver.mjs server --limite 0
node .claude/skills/desenvolver-server/driver.mjs packages/contracts --so camadas,fatia --min aviso
node .claude/skills/desenvolver-server/driver.mjs server/src/index.ts --json --min aviso
node .claude/skills/desenvolver-server/driver.mjs --ajuda
```

| opção                     | efeito                                                          |
| ------------------------- | --------------------------------------------------------------- |
| `--json`                  | resumo + achados em JSON (para guardar no scratchpad e filtrar) |
| `--min erro\|aviso\|info` | severidade mínima (padrão `info`)                               |
| `--so a,b`                | só estas categorias                                             |
| `--limite N`              | achados por categoria no texto (padrão 30; `0` = todos)         |

Exit code `0` com achados, `1` erro de execução (inclusive alvo no client), `2` sem alvo.

**O que cada categoria cobra**

| categoria      | regras                                                                                                                                                                                                                                                                                                                                                                                                                | o que ela pergunta                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `camadas`      | `consulta-fora-do-dao`, `camada-pura-com-io`, `camada-pura-com-relogio`, `po-com-logica`, `porta-com-lib-de-terceiro`, `porta-com-implementacao`, `adaptador-fora-da-infraestrutura`, `borda-sem-dto`, `schema-fora-do-contracts`, `dto-fora-do-contracts`, `vo-fora-do-game-core`; no contracts: `dto-sem-zod`, `dto-com-logica`, `dto-frouxo`; no game-core: `vo-mutavel`, `vo-com-identidade`, `vo-sem-construtor` | este arquivo faz o que o sufixo do nome promete?                                             |
| `dependencias` | `seta-invertida` (matriz de quem pode importar quem, por import de **valor** — e também de tipo quando o destino é DTO), `transversal-conhece-modulo`, `borda-de-outro-modulo`, `game-core-com-dependencia`                                                                                                                                                                                                           | alguma seta aponta para trás?                                                                |
| `contrato`     | `process-env-direto`, `console-no-server`, `identidade-do-payload`, `vo-por-assercao`, `db-importado-direto`                                                                                                                                                                                                                                                                                                          | as regras transversais do server foram respeitadas?                                          |
| `fatia`        | `plugin-fora-do-app`, `rotas-fora-do-plugin`, `gateway-fora-do-plugin`, `modulo-sem-plugin`, `bo-sem-spec`, `vo-sem-spec`, `dto-com-regra-sem-spec`                                                                                                                                                                                                                                                                   | terminou de ligar? (o typecheck não pega nada disto — vira 404 ou evento que ninguém escuta) |

O achado é **hipótese**: abra o trecho, confirme e classifique. Falso positivo entra na conversa com o motivo, não some em silêncio.

### 5. Verificação (da raiz)

```bash
pnpm exec vitest run <specs da fatia>
pnpm test && pnpm lint && pnpm typecheck
```

Integração (borda + DAO + Postgres real) só quando a fatia tocou routes, gateway, DAO, PO ou plugin, e sempre num Postgres descartável — a receita está em "Verificação por workspace" da skill `testar`. Nunca contra o banco do `pnpm db:up`.

### 6. Fechar

Re-rode o driver no alvo com `--min aviso`: os achados da sua fatia sumiram e **nenhum novo apareceu**. Depois atualize `docs/context/<área>.md` (estrutura, endpoints, eventos, DTOs, tabelas, env) e a tabela de áreas do `AGENTS.md` se a área é nova. Commit pelo `/commit`.

## Quando parar e perguntar

Cada item abaixo é uma decisão que **não é sua**. Junte as que aparecerem e pergunte com `AskUserQuestion` no passo 2, com a recomendação do projeto na frente:

| Gatilho                                                                                            | Por que é pergunta                                                                                                                          |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tabela, coluna, índice ou enum novo**                                                            | é migração do Drizzle (`pnpm db:generate` gera o SQL em `server/drizzle/`), entrega própria                                                 |
| **Encanamento novo ou mudado** (`src/app/`, `src/database/`, `src/realtime/`, `src/config/env.ts`) | a forma do app, da conexão e do servidor Socket.IO vale para todos os módulos (o que existe está em `docs/context/server.md`)               |
| **Env var nova**                                                                                   | entra no schema Zod de `src/config/`, no `server/.env.example` e em quem a recebe                                                           |
| **Mudança de contrato** (DTO, endpoint, nome ou payload de evento)                                 | o client consome pelo mesmo `@lorkarium/contracts`; as duas pontas mudam juntas ou o front quebra                                           |
| **Lib de terceiro nova**                                                                           | exige porta + adaptador, e a escolha da lib é do usuário                                                                                    |
| **Rota ou evento sem autenticação**                                                                | é furo consciente na sessão (spec §8.2), não detalhe de implementação                                                                       |
| **Dado que não filtra pela campanha da sessão**                                                    | isolamento por campanha é critério do MVP (spec §13.14); exceção é decisão                                                                  |
| **Transação própria ou estado em memória**                                                         | o estado das sessões ativas vive em memória e o banco é a fonte persistente (spec §5.5); como os dois não divergem é decisão de arquitetura |
| **Evento confirmado antes de persistir, ou sem versão**                                            | spec §5.5: persistir antes de confirmar; eventos com identificador e versão                                                                 |
| **Comando crítico sem `actionId`**                                                                 | a deduplicação por `ProcessedCommand` (spec §6) é o que impede aplicar duas vezes na retransmissão                                          |
| **Regra nova: game-core ou BO?**                                                                   | mecânica genérica que o client também precisa calcular vai para o game-core; decisão de permissão e de caso de uso fica no BO do server     |
| **Arquivo que não cabe em nenhuma camada**                                                         | sufixo novo é mudança de arquitetura, não decisão de tarefa                                                                                 |

## Autoteste do driver

```bash
node .claude/skills/desenvolver-server/autoteste.mjs
# -> autoteste ok: 47 achados na fixture (camadas 23 · dependencias 10 · contrato 5 · fatia 9), 33 regras distintas, 18 guardiões em silêncio
```

Ele roda o driver em `fixtures/monorepo/` (server com o módulo-molde `campaigns`, que precisa sair em silêncio, e o módulo `sessions`, que viola cada regra de propósito; game-core e contracts com um arquivo limpo e arquivos errados) e confere três coisas: que cada regra **dispara** onde deve, que os 18 guardiões **calam** e que nenhuma regra disparou sem expectativa declarada. **Regra nova entra com uma linha na fixture e uma expectativa no autoteste.**

## Gotchas

- **`socket.data.userId` é o certo, `payload.userId` é o achado.** O middleware de autenticação da conexão guarda o usuário em `socket.data`; o padrão de `identidade-do-payload` exclui `socket.data.` de propósito (o módulo-molde é o guardião).
- **O mapper constrói o BO**: `mapper → bo` por valor é a seta certa (é a conversão "PO precisa ser convertido para virar BO" do artigo). A seta proibida é a contrária, `bo → mapper`.
- **DTO é cobrado até por `import type` no DAO e no BO.** O tipo do DTO na assinatura já significa que a camada passou a falar forma de transferência; para as outras camadas, `import type` não conta.
- **`src/database/` importa os PO por definição** (o schema do Drizzle junta as tabelas), e o adaptador em `src/infrastructure/` importa a porta do módulo como tipo. Os dois não são `transversal-conhece-modulo`.
- **`src/app/` importa a instância do `db`**: é ele que monta o grafo e entrega o `db` aos plugins. Fora de `src/app/`, `src/database/` e `src/index.ts`, importar a instância é `db-importado-direto`.
- **`transaction` não é "consulta"** para `consulta-fora-do-dao`: quem abre a transação é o encanamento de `src/database/`, e onde ela nasce é pergunta (ver a tabela acima).
- **`z.object(` quebrado em linha** (`z\n  .object(`, como o Prettier formata cadeias longas) é achado do mesmo jeito: a busca é sobre o texto inteiro.
- **VO como `Readonly<{ ... }>` passa; `type X = { a: number }` não.** O tipo literal com membro sem `readonly` é `vo-mutavel`.
- **`bo-sem-spec` não olha se o spec presta**, só se ele existe no espelho. Quem julga se o `it` prova alguma coisa é o `/testar`.

## Troubleshooting

- **`typescript não encontrado a partir de …`**: `pnpm install` na raiz. O driver não instala nada.
- **`O alvo … está em client (client); esta skill é do server…`**: alvo no front. Use `/construir-tela` ou `/refatorar-client`.
- **`Alvo X não existe (resolvido para C:\…)`**: o caminho é relativo à raiz do repo — `server/src/modules/combat`, não `src/modules/combat`.
- **`--so com categoria desconhecida`**: as válidas são `camadas`, `dependencias`, `contrato`, `fatia`.
- **Rota responde 404 / evento não chega**: é `rotas-fora-do-plugin`, `gateway-fora-do-plugin` ou `plugin-fora-do-app` — o driver pega antes de subir o server.
