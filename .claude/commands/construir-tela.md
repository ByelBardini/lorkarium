---
description: Planeja a construção de uma tela do client a partir de um HTML de exemplo; pesquisa padrões de mercado para o tipo de tela, levanta pontos de melhoria com recomendação e gera um plano de implementação em que o HTML é base, nunca lei.
argument-hint: [caminho do HTML de exemplo] [descrição breve da tela]
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch, AskUserQuestion, Write, Bash(date:*), Bash(ls:*), Bash(find:*), Bash(mkdir:*), mcp__plugin_context7_context7__resolve-library-id, mcp__plugin_context7_context7__query-docs
---

# /construir-tela — Plano de tela a partir de um HTML de exemplo

Transforme um HTML de exemplo + descrição em um plano de implementação de tela para o `client/`, seguindo as etapas abaixo **na ordem**. O produto final é um único arquivo de plano em `docs/plans/` — nada além disso é criado ou alterado.

## Regras invioláveis

1. **O HTML de exemplo é base, NÃO é lei.** Ele comunica intenção — blocos de conteúdo, hierarquia, ações, dados exibidos. Quando o exemplo diverge da boa prática, isso vira ponto de melhoria (passo 4) e quem decide é o usuário — nunca cópia silenciosa, nem "melhoria silenciosa". "Manter como no exemplo" vale para o que a tela **faz e mostra**; nunca para como o código é escrito: a implementação sempre usa o vocabulário do projeto (React + Vite, Tailwind v4, shadcn/ui sobre Radix, React Router, Zustand, PixiJS para o tabuleiro) — estilos inline, `onclick` e markup do exemplo não são transcritos em nenhuma hipótese.
2. **Este comando NÃO implementa.** Nenhum código de produção, teste ou config é escrito aqui — o único `Write` permitido é o arquivo do plano.
3. **Todo ponto de melhoria traz uma recomendação.** A opção recomendada vem primeiro, com "(Recomendado)" no rótulo, e a descrição explica o porquê — baseado na pesquisa e no projeto, nunca "porque sim".
4. **O plano termina aguardando aprovação manual.** Depois de gerar o arquivo, pare. Não execute o plano, nem "só a fase 1".
5. **O tabuleiro não é DOM.** O que o exemplo desenha como mapa, grid, token ou barra de vida sobre o mapa vai para o renderer PixiJS (`client/src/renderer/`), não para JSX. Painéis, formulários, menus e o tracker de combate são React (spec §4.1).

## Passo a passo

### 1. Entender o exemplo e o pedido

A entrada está na seção "Entrada" no final deste comando: o caminho de um arquivo HTML de exemplo + uma descrição breve do que deve ser feito. Se o HTML não foi passado nem mencionado na conversa, pergunte por ele antes de qualquer outra coisa.

Leia o HTML inteiro e extraia a **intenção**, não a implementação:

- **Tipo de tela**: tabuleiro, painel lateral, tracker de iniciativa, listagem (campanhas, cenas), formulário, biblioteca (condições, imagens), configuração… — essa classificação guia a pesquisa do passo 3.
- **Blocos de conteúdo e hierarquia**: o que aparece, em que ordem, o que é primário e o que é secundário; o que é DOM e o que é tabuleiro (regra 5).
- **Ações e navegação**: botões, links, filtros, arrastes, e para onde levam. Para cada ação, se ela é **comando ao server** (mover token, avançar turno) ou estado local (selecionar, dar zoom).
- **Dados exibidos**: quais entidades e campos a tela consome, e **quem pode ver o quê** (mestre, jogador, espectador — spec §3.9).
- **Estados ausentes**: HTML estático quase nunca mostra vazio, carregando, erro, **desconectado/reconectando** e **comando recusado pelo server** — liste-os; são obrigatórios na implementação (ver passos 4 e 5).

Reformule em 2–3 frases: o que a tela faz, para quem, e qual problema resolve.

### 2. Mapear o que o projeto já tem

Leia o `AGENTS.md` e `docs/context/client.md` (e os docs das áreas que a tela toca, como `board.md` ou `combat.md`, se existirem). Depois confirme no código (`Glob`/`Grep`/`Read`) o que dá para reaproveitar: componentes shadcn/ui já instalados em `client/src/components/ui/`, componentes próprios, rotas do React Router, stores em `src/stores/`, serviços em `src/services/`, o renderer, e o que o game-core (`@lorkarium/game-core`) e o contracts (`@lorkarium/contracts`) já exportam.

Registre duas listas que entram no plano: **o que será reaproveitado** (com caminho) e **o que será criado do zero**.

Se a tela depende de dados, endpoints ou eventos que o server ainda não tem, registre a lacuna — ela vira pergunta de escopo no passo 4: planejar só o client contra um DTO documentado no plano (que entra em `packages/contracts`), ou incluir fases de server (pelo `/desenvolver-server`).

As libs do client são mais novas que o conhecimento de treinamento (React 19, React Router 8, Vite 8, PixiJS 8, Tailwind 4): o plano deve incluir a leitura dos guias em `client/node_modules/react-router/docs/` (rotas) e a consulta ao context7 (PixiJS, Zustand) antes de codificar.

### 3. Pesquisar padrões de mercado para o tipo de tela

Antes de opinar, pesquise como o mercado resolve o tipo de tela classificado no passo 1:

- **WebSearch** (2–4 buscas): padrões de UX consagrados para esse tipo de tela (VTTs como Foundry, Roll20, Owlbear Rodeo são referência para tabuleiro e tracker), organização de layout, acessibilidade, armadilhas conhecidas.
- **context7** (se envolver componente/lib específica): documentação atual no ecossistema do projeto (shadcn/ui, PixiJS, Zustand, React Router, Tailwind v4).

Anote padrões encontrados, trade-offs e fontes. Isso alimenta os pontos de melhoria do passo 4 e a seção "Padrões de mercado" do plano.

### 4. Levantar pontos de melhoria com recomendação

Compare o exemplo com a pesquisa e com os padrões do projeto. Vira ponto de melhoria toda divergência relevante: o que o exemplo faz, o que o mercado faz, e qual opção você recomenda. Some a isso as decisões que a descrição deixou em aberto (comportamento, escopo, dados, permissão), a lacuna de server do passo 2, e as dependências de teste que faltam (Testing Library + jsdom para spec de componente).

Estados vazio/carregando/erro/desconectado/recusado nunca viram pergunta de "ter ou não ter" — são obrigatórios e os testes do passo 5 os cobrem. Pergunte apenas a forma deles, e só se houver mais de uma opção defensável (skeleton vs spinner; desfazer a prévia do arraste vs manter com aviso, por exemplo).

Apresente tudo via **AskUserQuestion** (até 4 por chamada; faça quantas chamadas precisar):

- Primeira opção = a recomendada, rótulo terminando em "(Recomendado)".
- `description` de cada opção = consequência prática da escolha; na recomendada, o porquê da recomendação.
- "Manter como no exemplo" é uma opção válida sempre que aplicável — o usuário decide, não você.
- Pergunte só o que é decisão do usuário; não pergunte o que o código ou a pesquisa já respondem.

Só avance quando não restar decisão em aberto.

### 5. Montar o plano em fases TDD

Divida o trabalho em **fases pequenas** — cada fase entrega algo verificável e cabe em uma sessão. Specs em `client/test/` espelhando `src/`, importando via `@/...`, nunca ao lado do código. Todo teste nasce pelo `/testar` (cenários do contrato, vermelho primeiro, prova de que morde).

Cada fase segue TDD à risca, nesta ordem:

1. **Escrever o teste primeiro pelo `/testar`**: qual arquivo em `client/test/`, quais casos (incluindo vazio/carregando/erro/desconectado/recusado) e por que provam o comportamento. Lógica sem DOM (`src/lib/`, store, a conta do renderer) roda hoje; componente exige o ambiente de DOM decidido no passo 4.
2. **Rodar `pnpm exec vitest run <spec>` e ver falhar.**
3. **Implementar o mínimo** para passar: quais arquivos, qual mudança.
4. **Rodar e ver passar; refatorar** com os testes verdes; `pnpm lint && pnpm typecheck`.
5. **Atualizar `docs/context/client.md`** (ou o doc da área) com o que a fase entregou. Obrigatório e sempre o último passo da fase.

### 6. Gerar o arquivo do plano

```bash
mkdir -p docs/plans
date +%Y-%m-%d
```

Escreva o plano em `docs/plans/<data>-tela-<slug>.md` usando o template abaixo, em pt-BR.

### 7. Encerrar para aprovação

Mostre ao usuário: o caminho do arquivo, a lista de fases em uma linha cada, e as melhorias acordadas. Termine aí — **a aprovação é manual e a implementação só começa quando o usuário pedir.**

## Template do plano

```markdown
# Plano de tela: <título curto>

> **Status:** aguardando aprovação
> **Data:** <YYYY-MM-DD>
> **Exemplo de base:** <caminho do HTML>
> **Pedido original:** <resumo em 1 frase>

## A tela e sua intenção

<Reformulação do passo 1: o que a tela faz, para quem, tipo de tela, blocos (DOM × tabuleiro), ações (comando ao server × estado local) e permissões.>

## Padrões de mercado

<O que a pesquisa mostrou para esse tipo de tela, com links das fontes.>

## Melhorias acordadas

| Ponto   | No exemplo           | Decisão           | Por quê  |
| ------- | -------------------- | ----------------- | -------- |
| <ponto> | <o que o HTML fazia> | <opção escolhida> | <motivo> |

## O que já existe e será reaproveitado

- `<caminho>` — <o que é e como será usado>

## O que será criado do zero

- <item> — <por que não existe equivalente>

## Contrato com o server

- <DTO / evento que a tela consome ou dispara, em packages/contracts; lacuna de server, se houver>

## Fases

### Fase 1 — <nome curto do entregável>

**Objetivo:** <o que fica funcionando ao final da fase>

1. `/testar <alvo> "<comportamento>"` → `client/test/<caminho>`: <casos cobertos>
2. Rodar `pnpm exec vitest run client/test/<caminho>` e confirmar que falha
3. Implementar em `client/src/<caminhos>`: <mudança mínima>
4. Rodar e confirmar que passa; refatorar se necessário; `pnpm lint && pnpm typecheck`
5. Atualizar `docs/context/client.md`: <o que registrar>

### Fase 2 — ...

## Fora do escopo

- <o que ficou explicitamente de fora e por quê>
```

## Entrada

$ARGUMENTS
