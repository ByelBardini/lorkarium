---
description: Transforma um pedido em plano de implementação; pesquisa padrões de mercado, levanta perguntas com recomendação, confere docs/context e o docs/spec.md pra não repetir código e gera um plano em fases TDD para aprovação manual.
argument-hint: [descrição do que se quer planejar]
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch, AskUserQuestion, Write, Bash(date:*), Bash(ls:*), Bash(find:*), Bash(mkdir:*), mcp__plugin_context7_context7__resolve-library-id, mcp__plugin_context7_context7__query-docs
---

# /planejamento — Plano de implementação em fases TDD

Transforme o pedido do usuário em um plano de implementação aprovável, seguindo as etapas abaixo **na ordem**. O produto final é um único arquivo de plano em `docs/plans/` — nada além disso é criado ou alterado.

## Regras invioláveis

1. **Este comando NÃO implementa.** Nenhum código de produção, teste ou config é escrito aqui — o único `Write` permitido é o arquivo do plano.
2. **As perguntas vêm ANTES do plano.** Nunca gere o plano com decisão de implementação em aberto.
3. **Toda pergunta traz uma recomendação.** A opção recomendada vem primeiro, com "(Recomendado)" no rótulo, e a descrição explica o porquê — baseado na pesquisa, no `docs/spec.md` e no projeto, nunca "porque sim".
4. **O plano termina aguardando aprovação manual.** Depois de gerar o arquivo, pare. Não execute o plano, nem "só a fase 1".
5. **Todo teste do plano nasce pelo `/testar`.** O passo 1 de cada fase é uma chamada ao comando, com os cenários do contrato listados; a skill `testar` é quem garante que o teste prova comportamento e não existe só para passar. Fatia nova do server é entregue pelo `/desenvolver-server`; refatoração que o plano prevê, pelo `/refatorar-server` ou `/refatorar-client` — todos escrevem seus testes pelo `/testar`.

## Passo a passo

### 1. Entender o pedido

O pedido está na seção "Pedido do usuário" no final deste comando. Se estiver vazio, pergunte ao usuário o que ele quer planejar antes de qualquer outra coisa.

Reformule o pedido em 2–3 frases: o que será construído, para quem (mestre, jogador, espectador), e qual problema resolve. Localize-o no `docs/spec.md`: qual seção do escopo (§3), qual fase do plano de implementação (§11), quais critérios do MVP (§13) ele toca. Essa reformulação abre o plano e ancora a pesquisa.

### 2. Pesquisar padrões de mercado

Antes de opinar, pesquise como o mercado resolve esse tipo de problema:

- **WebSearch** (2–4 buscas): padrões de arquitetura, fluxos consagrados, armadilhas conhecidas para esse tipo de funcionalidade (para um VTT: sincronização autoritativa, reconciliação de estado, coordenadas de mundo × tela, deduplicação de comandos).
- **context7** (se envolver biblioteca específica): documentação atual da lib no ecossistema do projeto — Fastify, Drizzle, Socket.IO, PixiJS v8, React Router, Zustand, Zod. As versões do repo são mais novas que o conhecimento de treinamento; o React Router traz os guias em `client/node_modules/react-router/docs/`.

Anote o que encontrou: abordagens comuns, trade-offs entre elas, e o que é considerado boa prática hoje. Isso alimenta as recomendações do passo 3 e a seção "Contexto" do plano.

### 3. Levantar perguntas com recomendação

Compare o pedido com o que a pesquisa e o spec mostraram. Toda decisão de implementação que o pedido deixa em aberto vira pergunta via **AskUserQuestion** (até 4 por chamada; faça quantas chamadas precisar):

- Primeira opção = a recomendada, rótulo terminando em "(Recomendado)".
- `description` de cada opção = consequência prática da escolha; na recomendada, o porquê da recomendação.
- Pergunte só o que é decisão do usuário: escopo, comportamento esperado, trade-offs de produto ou de arquitetura (a regra mora no game-core ou no BO? HTTP ou evento? quem pode?). Não pergunte o que o código, o spec ou a pesquisa já respondem.

Só avance quando não restar decisão em aberto.

### 4. Explorar o que já existe (`docs/context`)

Com as respostas em mãos, descubra o que o projeto já tem para **não repetir código**:

1. Leia o `AGENTS.md` e os arquivos relevantes de `docs/context/` para mapear módulos, utilitários e padrões já documentados — em especial o que o game-core e o contracts já exportam.
2. Confirme no código (Glob/Grep/Read) que o que está documentado ainda existe e onde está.
3. Se `docs/context/` não existir ou não cobrir a área do pedido: explore o código diretamente e inclua no plano a criação do arquivo de contexto correspondente (o nome segue a regra do `/atualizar-contexto`).

Registre duas listas explícitas, que entram no plano: **o que será reaproveitado** (com caminho dos arquivos) e **o que será criado do zero**.

### 5. Montar o plano em fases TDD

Divida o trabalho em **fases pequenas** — cada fase entrega algo verificável e cabe em uma sessão de trabalho. Prefira mais fases pequenas a poucas fases grandes. Ordem natural entre workspaces: game-core (VO e regra) → contracts (DTO) → server (fatia) → client (tela, store, renderer).

Cada fase segue TDD à risca, nesta ordem:

1. **Escrever o teste primeiro pelo `/testar`**: o passo cita a chamada exata (`/testar <alvo> "<comportamento a provar>"`), o arquivo de teste que ela vai criar e os **cenários do contrato** que precisam virar `it` — feliz, borda e erro, cada um com entrada e resultado observável. O `/testar` chama a skill `testar`, que roda o driver de auditoria, levanta os cenários antes de escrever e só dá o teste por pronto quando ele **falha pela razão certa** e prova que morde (uma inversão na regra deixa o `it` vermelho). Teste que existe para passar não entra no plano.
2. **Rodar e ver falhar** — `pnpm exec vitest run <spec>` da raiz; a falha esperada é a da asserção, não `import` quebrado.
3. **Implementar o mínimo** para o teste passar: quais arquivos, qual mudança (no server, nas camadas do `/desenvolver-server`).
4. **Rodar e ver passar; refatorar** se necessário, com os testes verdes. Fechar a fase com o driver do `/testar` no alvo (`--min aviso`) sem achado novo, `pnpm lint` e `pnpm typecheck`.
5. **Atualizar `docs/context/`** com o que a fase entregou (qual arquivo, o que registrar). Este passo é obrigatório e é sempre o último de cada fase.

Ao listar os cenários do passo 1, use a régua da skill `testar`: cenário vem do contrato (doc da área, spec, assinatura, `throw` e `if` da fonte), nunca de "linha não coberta"; o valor esperado é escrito à mão; I/O externo entra por fake nomeado. Diga em qual camada cada cenário é provado:

- **game-core**: unit puro (VO recusa citando o valor; regra de jogo dá o mesmo resultado para a mesma entrada).
- **contracts**: unit só para DTO com `refine`/`transform`.
- **server**: unit para BO e mapper (sem banco, sem Fastify) e service com fakes nomeados; **integração** (`server/test/integration/`, Postgres descartável, `app.inject()` e cliente Socket.IO real) para borda, DAO, permissão e **isolamento por campanha** — "campanha B não vê o token da campanha A" é cenário obrigatório de todo dado de campanha.
- **client**: sem DOM para `src/lib/`, stores e a conta do renderer; componente para `features/` e `components/` (exige Testing Library + jsdom, que ainda não estão instalados: dependência nova é pergunta do passo 3).

### 6. Gerar o arquivo do plano

```bash
mkdir -p docs/plans
date +%Y-%m-%d
```

Escreva o plano em `docs/plans/<data>-<slug-do-pedido>.md` usando o template abaixo, em pt-BR.

### 7. Encerrar para aprovação

Mostre ao usuário: o caminho do arquivo, a lista de fases em uma linha cada, e as decisões tomadas nas perguntas. Termine aí — **a aprovação é manual e a implementação só começa quando o usuário pedir.**

## Template do plano

```markdown
# Plano: <título curto>

> **Status:** aguardando aprovação
> **Data:** <YYYY-MM-DD>
> **Pedido original:** <resumo em 1 frase>
> **No spec:** <§ do escopo, fase do §11, critérios do §13>

## Contexto

<Reformulação do pedido (passo 1) + o que a pesquisa de mercado mostrou (passo 2), com links das fontes.>

## Decisões tomadas

| Pergunta   | Escolha           | Por quê  |
| ---------- | ----------------- | -------- |
| <pergunta> | <opção escolhida> | <motivo> |

## O que já existe e será reaproveitado

- `<caminho>` — <o que é e como será usado>

## O que será criado do zero

- <item> — <por que não existe equivalente>

## Fases

### Fase 1 — <nome curto do entregável>

**Objetivo:** <o que fica funcionando ao final da fase>

1. `/testar <alvo> "<comportamento>"` → `<caminho do teste>` com os cenários: <feliz: entrada → resultado>; <borda: …>; <erro: …> (camada: <game-core | contracts | unit do server | integração | sem DOM | componente>)
2. Rodar `pnpm exec vitest run <spec>` e confirmar que falha pela asserção
3. Implementar em `<caminhos>`: <mudança mínima>
4. Rodar `pnpm exec vitest run <spec>` e confirmar que passa; refatorar se necessário; driver do `/testar` no alvo sem achado novo; `pnpm lint && pnpm typecheck`
5. Atualizar `docs/context/<arquivo>`: <o que registrar>

### Fase 2 — ...

## Fora do escopo

- <o que ficou explicitamente de fora e por quê>
```

## Pedido do usuário

$ARGUMENTS
