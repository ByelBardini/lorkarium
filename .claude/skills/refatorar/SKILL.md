---
name: refatorar
description: Diagnostica e refatora um alvo (pasta ou arquivo) de qualquer workspace do monorepo — client/, server/, packages/game-core/ ou packages/contracts/. Roda o driver de análise estática do projeto (monólitos, código morto, duplicação inclusive entre workspaces, lógica genérica que já existe em src/lib/ ou no game-core, nomes, comentários, lugar na arquitetura), confirma cada achado no código e entrega um plano em fases de até 5 arquivos que só executa após aprovação. Use quando o usuário pedir para refatorar, limpar, revisar a qualidade, procurar duplicação ou "melhorar" uma pasta.
argument-hint: [pasta ou arquivo, relativo à raiz do repo — ex.: server/src/modules/combat]
allowed-tools: Read, Grep, Glob, Edit, Write, AskUserQuestion, Bash(node:*), Bash(pnpm:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(ls:*), Bash(find:*)
---

# /refatorar — Diagnóstico e refatoração em fases

O alvo chega em `$ARGUMENTS`. O diagnóstico é feito por `.claude/skills/refatorar/driver.mjs` (Node puro sobre o `typescript` da raiz do monorepo). Ele lê **todos os workspaces**, ancora os achados nos arquivos do alvo e os compara com o resto do monorepo: o export do game-core que só o client usa, o tipo do client que repete um DTO do contracts, o `gridSize` que o server reescreve à mão quando o game-core já encapsula. O julgamento é seu: o relatório é hipótese, o código é a prova. Todo caminho abaixo é relativo à **raiz do repositório**.

## Regras invioláveis

1. **Diagnóstico antes de qualquer edição.** Nenhum arquivo muda até o plano ser aprovado. Nada de refatorar "de passagem" o que não está no plano.
2. **Achado do driver é hipótese.** Cada `erro`/`aviso` é aberto no código e classificado: confirmado, falso positivo (com o motivo) ou fora do escopo. Só o confirmado entra no plano.
3. **Fases de até 5 arquivos** (CLAUDE.md). Cada fase termina com testes verdes, driver re-rodado e aprovação explícita. Não execute a fase 1 sem o "pode".
4. **Comportamento não muda.** Refatoração preserva contrato e testes existentes. Bug encontrado no caminho vira teste de regressão e item separado do plano, nunca correção silenciosa.
5. **Função extraída ganha teste** em `<workspace>/test/`, espelhando `src/`. O teste é escrito pelo `/testar <arquivo extraído>` (skill `testar`): cenários do contrato, vermelho primeiro e a prova de que o `it` morde. O plano da fase cita essa chamada no item "Testes".
6. **Docs acompanham.** Estrutura, contrato ou env alterados → atualizar `docs/context/<área>.md`; padrão errado corrigido → seção "Armadilhas" da área.

## Pré-requisitos

Node 22 (`.nvmrc`) e `pnpm install` feito na raiz. O driver carrega o `typescript` de `node_modules/` da raiz; não instala nada e não escreve nada.

```bash
node --version   # v22.17.0
```

## Passo a passo

### 1. Fixar o alvo

Se `$ARGUMENTS` estiver vazio, pergunte qual pasta ou arquivo refatorar. O alvo precisa estar dentro de um workspace (`client/`, `server/`, `packages/game-core/`, `packages/contracts/`); pode ser um arquivo só.

### 2. Rodar o driver e ler o contexto da área

```bash
node .claude/skills/refatorar/driver.mjs server/src/modules/combat
```

O cabeçalho traz `leia antes:` com os docs que existem para o alvo: o hub do workspace (`docs/context/server.md`) e o doc da área com o nome da pasta (`docs/context/combat.md` ou `docs/context/server/combat.md`). **Abra esses docs antes de qualquer fonte** (regra do CLAUDE.md): é lá que está a decisão que explica o que parece cheiro mas é intenção. Sem doc da área, leia a seção correspondente de `docs/spec.md`.

Variações verificadas:

```bash
node .claude/skills/refatorar/driver.mjs client/src --so duplicacao,utilitarios --limite 0
node .claude/skills/refatorar/driver.mjs server --json --min aviso
node .claude/skills/refatorar/driver.mjs packages/game-core/src/index.ts --min aviso
node .claude/skills/refatorar/driver.mjs --ajuda
```

| opção                     | efeito                                                          |
| ------------------------- | --------------------------------------------------------------- |
| `--json`                  | resumo + achados em JSON (para guardar no scratchpad e filtrar) |
| `--min erro\|aviso\|info` | severidade mínima (padrão `info`)                               |
| `--so a,b`                | só estas categorias                                             |
| `--limite N`              | achados por categoria no texto (padrão 30; `0` = todos)         |

Exit code `0` com achados, `1` erro de execução, `2` sem alvo. Uma rodada leva ~0,2 s no monorepo de hoje; não precisa guardar nada entre rodadas.

**Categorias e o que cada regra significa**

| categoria      | regras                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | o que olhar                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `arquitetura`  | comuns: `teste-ao-lado-do-codigo`, `spec-importa-src-relativo` (só em workspace com alias), `lib-de-terceiro-fora-do-adaptador`, `console-em-producao`, `import-profundo-de-outro-workspace`; server: `process-env-direto`, `identidade-do-payload`, `repositorio-de-outro-modulo`, `helper-compartilhado-em-modulo`, `handler-com-logica`; client: `process-env-no-client`, `fetch-cru-em-componente`, `socket-cru-em-componente`, `react-no-renderer`, `logica-na-rota`, `componente-na-area-errada`, `logica-exportada-de-componente`; game-core: `game-core-com-dependencia`, `game-core-nao-deterministico`; contracts: `contracts-com-dependencia`, `logica-no-contrato` | o arquivo está no workspace e na pasta certos, e obedece às regras do `AGENTS.md` e do `docs/spec.md` §2?                                         |
| `duplicacao`   | `bloco-duplicado` (≥ 6 linhas iguais a menos de literais, dentro do alvo ou contra o monorepo), `funcao-homonima` (função de módulo com o mesmo nome em outro arquivo), `tipo-com-mesmos-membros` (o tipo do client que repete o DTO do contracts aparece aqui)                                                                                                                                                                                                                                                                                                                                                                                                                | duplicação acidental (mesmo texto, motivos diferentes) fica; essencial (mesma regra) sai                                                          |
| `utilitarios`  | `utilitario-existente-ignorado` (usa `gridSize`, `Math.hypot`, `window.history`, `toFixed`, `console.*`… direto quando `src/lib/` ou o game-core já encapsula), `logica-generica-repetida` (o mesmo sinal em 2+ arquivos do alvo sem util existente), `funcao-generica-fora-da-lib`, `logica-generica-em-componente`                                                                                                                                                                                                                                                                                                                                                           | cálculo de grid, distância, câmera, data, texto, browser que poderia ser um util central — a sugestão lista os utils existentes com o mesmo sinal |
| `monoliticos`  | `arquivo-grande` (> 500 linhas úteis; info a partir de 400), `funcao-longa` (função > 20, hook > 30, componente > 60 linhas úteis; `erro` acima do dobro), `funcao-complexa` (ciclomática > 10), `aninhamento-profundo` (> 2 níveis), `muitos-parametros` (> 4), `classe-grande`, `muitos-imports`, `responsabilidades-misturadas`                                                                                                                                                                                                                                                                                                                                             | quebrar por responsabilidade, não por tamanho                                                                                                     |
| `codigo-morto` | `export-sem-uso` (para pacote: "a entrada exporta e nenhum workspace usa"), `export-usado-so-em-teste`, `arquivo-orfao`, `import-sem-uso`, `membro-privado-sem-uso`, `codigo-comentado`, `codigo-inalcancavel`, `marcador-pendente`                                                                                                                                                                                                                                                                                                                                                                                                                                            | confirmar com `Grep` no monorepo antes de apagar; entradas (`src/index.ts`, `src/main.tsx`, a entrada do pacote) já estão isentas                 |
| `nomes`        | `nome-generico` (`data`, `handler`, `Manager`, `helper`, `tmp`…), `nome-vago` (`item`, `value`, `result`, `*Data`, `*Info`), `nome-curto`, `arquivo-fora-do-kebab-case`, `pasta-fora-do-kebab-case`, `any-explicito`, `export-sem-tipo-de-retorno`, `numero-magico`, `mensagem-de-erro-sem-valor`, `else-depois-de-return`, `ternario-aninhado`, `supressao-de-lint-ou-tipo`                                                                                                                                                                                                                                                                                                   | o nome diz o que é? o tipo é explícito? a exceção cita o valor e a forma esperada?                                                                |
| `comentarios`  | `comentario-o-que` (narra o código ou repete os identificadores da linha seguinte), `export-sem-docstring`, `docstring-sem-exemplo` (função pública sem a linha `Example:`), `comentario-de-secao`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | comentário é porquê; docstring é intenção + um exemplo                                                                                            |

### 3. Triagem no código

Para cada `erro` e `aviso` (e para os `info` de `duplicacao` e `utilitarios`, que são os mais rentáveis): abra o trecho com `Read` (offset/limit), confirme e anote a classificação. Critérios que o driver não tem:

- **Duplicação**: só extrair quando as cópias mudariam juntas. Duas validações iguais no client e no server são um DTO que falta no contracts; dois `if` parecidos com motivos diferentes não são.
- **Util genérico**: regra de jogo (célula, distância, turno, duração de condição) vai para `packages/game-core`; genérico sem domínio vai para o `src/lib/` do workspace. Se a sugestão aponta um util existente, o caminho é chamar ou estender ele, nunca criar o terceiro.
- **Monólito de componente**: procure responsabilidades (estado, layout, ação, desenho), não linhas. Componente de 70 linhas com uma responsabilidade fica.
- **Nome**: só proponha troca quando tiver o nome melhor na mão.
- **Código morto**: `export-sem-uso` de tipo usado só na assinatura pública não é morto (o driver já pula); constante `export-usado-so-em-teste` é sinal de spec acoplado ao interno. Export de pacote sem consumidor é API pública que nasceu antes da hora.
- **Arquitetura**: `repositorio-de-outro-modulo` e `helper-compartilhado-em-modulo` são acoplamentos que o TypeScript permite; viram item de plano só se a área tiver dono claro.

### 4. Diagnóstico para o usuário

Entregue, nesta ordem: a tabela de resumo do driver; os achados **confirmados** agrupados por categoria, cada um com a proposta concreta (extrair X para `packages/game-core/src/y.ts` com teste Z; apagar W; mover V para `features/<área>/`); e a lista do que foi descartado com o motivo em uma linha. Priorize: `erro` > `aviso` > `info`; dentro de cada nível, arquitetura (workspace errado, lib fora do adaptador, identidade do payload) e duplicação entre workspaces > util existente ignorado > monólito > código morto > nome e comentário.

### 5. Plano em fases

Escreva o plano em `docs/plans/refatorar-<alvo-em-kebab>-<AAAA-MM-DD>.md` (mesma pasta do `/planejamento`). Cada fase tem no máximo 5 arquivos tocados e traz:

- **Arquivos** e a mudança em cada um.
- **Testes**: os que nascem (função extraída, pelo `/testar`) e os que se ajustam (import, nome). Bug encontrado → teste de regressão primeiro.
- **Verificação** (da raiz):

  ```bash
  pnpm exec vitest run <specs tocados>
  pnpm test && pnpm lint && pnpm typecheck
  ```

- **Docs**: o `docs/context/<área>.md` a atualizar, se estrutura ou contrato mudarem.

Pare aqui e peça aprovação com `AskUserQuestion` ("Executo a fase 1?"). Sem "pode", o produto desta skill é o plano.

### 6. Executar fase a fase

Para cada fase aprovada: aplique as mudanças; rode os testes; re-rode o driver no alvo com `--min aviso` e confirme que os achados tratados sumiram **e nenhum novo apareceu**; commit pelo `/commit`; só então peça a próxima fase. Se um ajuste falhar duas vezes, pare, releia a seção inteira e diga qual premissa estava errada (CLAUDE.md).

### 7. Fechamento

Atualize `docs/context/<área>.md` (ou rode `/atualizar-contexto`) se a refatoração mexeu em estrutura, contrato, eventos ou env; registre em "Armadilhas" o padrão que causou a refatoração; liste as pendências (os `info` não tratados) no fim do plano.

## Autoteste do driver

```bash
node .claude/skills/refatorar/autoteste.mjs
# -> ok  server: 56 achados, 42 esperados, 12 proibidos
# -> ok  client: 25 achados, 21 esperados, 6 proibidos
# -> ok  game-core: 5 achados, 4 esperados, 4 proibidos
# -> ok  contracts: 7 achados, 4 esperados, 1 proibidos
# -> autoteste passou: 93 achados, 53 regras distintas.
```

Ele roda o driver em `fixtures/monorepo/` (um monorepo de mentira com server, client, game-core e contracts, cheio de cheiros propositais) e confere, regra por regra, o que dispara e o que cala (`refetch()` não é `fetch(`, `loader` de rota não é export morto, o `index.ts` do server é consumidor e não re-exportação, o game-core inteiro é "a lib"). Também falha se alguma regra disparar sem expectativa declarada. **Regra nova ou ajuste de limiar entra com uma linha na fixture e uma expectativa aqui.** As fixtures estão no `ignores` do `eslint.config.js` e no `.prettierignore`, e ficam fora dos `projects` do Vitest e do `tsc` de cada workspace.

## Como o driver funciona

- `lib/ambiente.mjs` acha o workspace do alvo (primeiro `package.json` com `src/` acima dele), lê o `pnpm-workspace.yaml` da raiz do monorepo, descreve cada workspace (tipo `server` se tem `fastify`, `client` se tem `react`, `game-core`/`contracts` pelo nome do pacote; a entrada do pacote pelo `exports`; os aliases do `tsconfig.json`) e carrega o `typescript`.
- `lib/fichas.mjs` parseia `src/`, `test/`, `scripts/` e os `.ts` da raiz de **todos** os workspaces com o parser sintático (sem type-checker): imports resolvidos (relativo, alias e `@lorkarium/<pacote>` → a entrada do pacote), exports, funções (linhas úteis, complexidade, profundidade), classes, comentários, contagem de identificadores. `src/generated/`, `src/components/ui/` e o `src/lib/utils.ts` do shadcn contam para referências, não para estilo.
- `lib/contextos.mjs` deriva o `leia antes:` do caminho (hub do workspace + doc com o nome da pasta). Os drivers do `/testar` e do `/desenvolver-server` usam o mesmo.
- Uma categoria por arquivo em `lib/`: `arquitetura`, `duplicacao`, `utilitarios`, `monoliticos`, `codigo-morto`, `nomes-e-comentarios`. Cada regra devolve `{ categoria, regra, severidade, arquivo, linha, mensagem, sugestao }`; `relatorio.mjs` imprime texto ou JSON.

## Gotchas

- **O monorepo inteiro entra, o alvo ancora.** Achado com os dois lados no alvo ancora no primeiro arquivo em ordem alfabética e cita o outro na mensagem (`bloco-duplicado`, `funcao-homonima`, `tipo-com-mesmos-membros`). Não é achado faltando no segundo arquivo.
- **Export de pacote só vive se outro workspace usar.** A re-exportação na entrada (`export { x } from './x'` ou `export * from './x'`) não conta como uso; o achado diz "a entrada exporta e nenhum workspace usa". App (server, client) não tem entrada de pacote: o `src/index.ts` dele é consumidor de verdade.
- **`spec-importa-src-relativo` só vale com alias.** Hoje só o client tem `@/*` no `tsconfig.json`; no server e nos pacotes o relativo é o único caminho até o alias existir, e configurar o alias é pergunta para o usuário.
- **`import type` não conta como lib fora do adaptador.** O gateway pode declarar `import type { Socket } from 'socket.io'`; o que vaza é o import de valor.
- **`socket.data.userId` não é identidade do payload.** É onde o middleware de autenticação da conexão guarda o usuário — o lugar certo. `body.userId`, `payload.role` e `const { userId } = request.body` são o achado.
- **O plugin de rotas não leva `funcao-longa`.** A função exportada de um `*.routes.ts`/`*.gateway.ts` soma todos os handlers anônimos de dentro; cada handler é medido por si em `handler-com-logica` (linhas, complexidade e profundidade).
- **Componente tem teto 60, hook 30, função 20** (linhas úteis: sem vazias nem comentários). JSX conta. Não é para picar componente por tamanho.
- **O game-core inteiro é a lib do domínio.** `funcao-generica-fora-da-lib` não dispara lá; dispara no client e no server quando reescrevem o que o game-core tem.
- **Nome curto de geometria passa**: `a`/`b` de comparador, `ax`, `by`, `dx`, `dy`, `hp`, `x0`, `y1`.
- **`refetch()` não é `fetch(`**: o marcador usa lookbehind, não grep cru.
- **Caminho no Windows**: passe o alvo relativo com barra normal; o relatório imprime `arquivo:linha` com barra normal, clicável no editor.

## Troubleshooting

- **`typescript não encontrado a partir de …`**: `pnpm install` na raiz. O driver não instala nada.
- **`Nenhum package.json com pasta src/ acima de …`**: o alvo está fora de um workspace (ex.: `docs/`, `infra/`). Aponte para dentro de `client/`, `server/` ou `packages/<pacote>/`.
- **`Alvo X não existe (resolvido para C:\…)`**: o caminho é relativo à raiz do repo — `server/src/modules/combat`, não `src/modules/combat`.
- **`--so com categoria desconhecida`**: os nomes válidos estão na mensagem; sem acento e com hífen (`codigo-morto`).
