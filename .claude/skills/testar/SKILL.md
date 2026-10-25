---
name: testar
description: Escreve, completa ou audita os testes de um alvo (spec, pasta de test/ ou arquivo/pasta de src/) de qualquer workspace — client/, server/, packages/game-core/ ou packages/contracts/. Roda o driver de auditoria de testes do projeto (lugar do spec, espelho src ↔ test, se cada it prova alguma coisa, se o nome descreve um cenário), levanta os cenários que a fonte promete antes de escrever qualquer it e só dá o teste por pronto quando ele falha pela razão certa com o comportamento errado. Use quando o usuário pedir para testar, cobrir, escrever spec, revisar testes, corrigir um bug (regressão), investigar um teste quebrado ou falhando, ou quando uma fase do /planejamento ou do /refatorar pedir teste.
argument-hint: [spec, pasta de test/ ou arquivo/pasta de src/, relativo à raiz do repo — ex.: packages/game-core/src] [comportamento a provar, opcional]
allowed-tools: Read, Grep, Glob, Edit, Write, AskUserQuestion, Bash(node:*), Bash(pnpm:*), Bash(cp:*), Bash(sed:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(ls:*), Bash(find:*)
---

# /testar — Testes que provam comportamento

O alvo chega em `$ARGUMENTS`: um spec, uma pasta de `test/` ou um arquivo/pasta de `src/`, mais (opcional) o comportamento que a fase quer provar. A auditoria é de `.claude/skills/testar/driver.mjs` (Node puro sobre o `typescript` da raiz, reaproveitando a lib da skill `refatorar`): ele monta o espelho `src ↔ test`, lê cada `it` e diz onde o spec mora, se ele prova alguma coisa e se o nome descreve um cenário. O julgamento é seu: o relatório é hipótese, o contrato da fonte é a régua. Todo caminho abaixo é relativo à **raiz do repositório**.

O objetivo não é "ter teste": é ter **um teste que quebra quando o comportamento quebra**. Teste que passa com a implementação apagada, que confere o que o mock devolveu ou que existe para subir o número da cobertura não conta — sai ou vira teste de verdade.

## Regras invioláveis

1. **Todo `it` precisa poder falhar.** Antes de dar um teste por pronto, responda: _qual mudança no código de produção faz este `it` ficar vermelho?_ Se a resposta é "nenhuma", "só apagar a função" ou "só se o mock mudar", o teste não prova nada e não entra.
2. **Vermelho primeiro.** Teste de comportamento novo roda e **falha pela razão certa** antes da implementação (é o TDD do `/planejamento`). Teste de bug **reproduz o bug** antes da correção e cita de onde veio (`// Regression: <o que quebrava> (#issue, SHA, data ou armadilha)`). Teste que já nasce verde precisa da prova de que falharia: quebre a regra de propósito, veja falhar, desfaça.
3. **Cenário vem do contrato, não da linha.** Os `it` nascem da lista "o que esta fonte promete" (passo 3): entradas válidas, bordas, erros, o que ela recusa. Nunca de "esta linha ainda não está coberta". Cobertura é consequência, não alvo.
4. **Lugar e import fixos** (CLAUDE.md): spec em `<workspace>/test/` espelhando `src/`; integração do server (Fastify `inject`, Postgres real, cliente Socket.IO real) em `server/test/integration/`. Import pelo alias do workspace quando ele existe (`@/...` no client); nos workspaces sem alias (server, pacotes), relativo até o alias ser configurado.
5. **A unidade roda de verdade; só as bordas são falsas.** I/O externo entra por **fake nomeado** (`class StorageFake implements StoragePort`), nunca `vi.fn()` solto num objeto inline, e nunca `vi.mock` do próprio arquivo que o spec espelha.
6. **Um cenário por `it`, nome = situação + resultado.** "player moving a token they do not control is refused with NOT_TOKEN_CONTROLLER", não "works" nem "error". Tabela de casos é `it.each` com placeholder no nome.
7. **Nada muda em produção "de passagem".** Bug achado enquanto se testa vira teste de regressão vermelho e item separado; a correção é outra entrega (ou a fase seguinte do plano). Nenhum `.only` sobrevive; `.skip` só com o porquê na mensagem do commit.

## Pré-requisitos

Node 22.23.4 (`.nvmrc`) e `pnpm install` feito na raiz. O driver carrega o `typescript` da raiz; não instala nada.

```bash
node --version   # v22.17.0
```

## Passo a passo

### 1. Fixar o alvo e o modo

Se `$ARGUMENTS` estiver vazio, pergunte o alvo. Ele define o modo:

| alvo                                                                          | modo          | produto                                                                                  |
| ----------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| arquivo/pasta de `src/` sem spec, ou comportamento novo descrito no argumento | **cobrir**    | specs novos com os cenários do contrato (vermelhos primeiro se a fonte ainda não existe) |
| arquivo/pasta de `src/` com spec                                              | **completar** | os cenários que faltam + correção dos `it` que não provam nada                           |
| spec ou pasta de `test/`                                                      | **auditar**   | diagnóstico dos `it` + correção dos achados confirmados                                  |

O comando `/testar` acrescenta a lente de cada workspace (em qual camada cada cenário é provado); se esta skill foi invocada direto, leia a seção "Testes" do `AGENTS.md` antes de escrever.

### 2. Rodar o driver e ler o contexto da área

```bash
node .claude/skills/testar/driver.mjs server/src/modules/combat
```

O cabeçalho traz `leia antes:` com o hub do workspace e o doc da área (derivados do caminho). **Abra esses docs antes de qualquer fonte** — é onde estão as regras que os cenários precisam provar (quem pode mover qual token, o que acontece no fim da rodada, como a versão do snapshot avança). Sem doc da área, leia a seção correspondente de `docs/spec.md`.

Variações verificadas:

```bash
node .claude/skills/testar/driver.mjs packages/game-core --min aviso
node .claude/skills/testar/driver.mjs client/src --so prova,cenarios --limite 0
node .claude/skills/testar/driver.mjs server --json
node .claude/skills/testar/driver.mjs --ajuda
```

| opção                     | efeito                                                                    |
| ------------------------- | ------------------------------------------------------------------------- |
| `--json`                  | espelho + resumo + achados em JSON (para guardar no scratchpad e filtrar) |
| `--min erro\|aviso\|info` | severidade mínima (padrão `info`)                                         |
| `--so a,b`                | só estas categorias                                                       |
| `--limite N`              | achados por categoria no texto (padrão 30; `0` = todos)                   |

Exit code `0` com achados, `1` erro de execução, `2` sem alvo. Uma rodada leva menos de 1 s.

**Categorias e o que cada regra significa**

| categoria  | regras                                                                                                                                                                                                                                               | o que olhar                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lugar`    | `teste-fora-de-test` (erro), `spec-importa-src-relativo` (só em workspace com alias), `mock-da-unidade-sob-teste` (erro), `spec-sem-espelho` (info)                                                                                                  | o spec está em `test/` espelhando `src/`, importa pelo alias e não mocka a própria unidade?                                                                      |
| `espelho`  | `fonte-sem-spec`                                                                                                                                                                                                                                     | a seção `## espelho src ↔ test` lista cada fonte do alvo e quem a espelha (pelo nome ou por importar o arquivo); a sugestão traz o caminho canônico do spec novo |
| `prova`    | `teste-sem-assercao` (erro), `assercao-tautologica` (erro; aviso quando é chamada dos dois lados), `eco-do-mock`, `so-verifica-chamada`, `so-snapshot`, `assercao-fraca`, `teste-pulado`, `teste-exclusivo` (erro), `dependencia-fake-inline` (info) | o `it` observa um resultado que a unidade produziu, ou só confere que algo existe, foi chamado ou voltou o que o mock deu?                                       |
| `cenarios` | `nome-sem-cenario`, `nome-repetido`, `describe-sem-teste`, `cenario-longo` (info), `regressao-sem-referencia` (info)                                                                                                                                 | o nome diz situação + resultado? cada `it` é um cenário? a regressão diz de onde veio?                                                                           |

### 3. Levantar os cenários do contrato

Antes de escrever ou julgar qualquer `it`, abra a fonte e liste **o que ela promete**, em tabela, no scratchpad ou na própria resposta:

| cenário                             | entrada                                    | resultado observável                             | tipo       |
| ----------------------------------- | ------------------------------------------ | ------------------------------------------------ | ---------- |
| avança para o próximo da iniciativa | ordem `[hero 17, goblin 3]`, ativo `hero`  | ativo `goblin`, rodada igual                     | feliz      |
| último da ordem fecha a rodada      | ativo `goblin` (último)                    | ativo `hero`, rodada + 1                         | borda      |
| combate sem participantes           | ordem `[]`                                 | lança `EmptyCombatError` citando o id do combate | erro       |
| jogador move token de outro         | token sem o jogador entre os controladores | `NOT_TOKEN_CONTROLLER`, estado intacto           | segurança  |
| token de outra campanha             | id existente fora da campanha da sessão    | `NOT_FOUND`, nunca vaza que existe               | isolamento |

Fontes dos cenários, nesta ordem: o doc da área e o `docs/spec.md` (regra de negócio), a assinatura e os tipos (o que entra, o que sai), os `throw` e os `if` da fonte (bordas e recusas), o spec existente (o que já está provado). Todo cenário de **erro** e de **borda** entra na lista; o feliz sozinho não é contrato. Cenário que a fonte promete e não cumpre é **bug**: regra 7.

Em modo **completar/auditar**, cruze a tabela com os `it` existentes: cenário sem `it` é o que falta; `it` sem cenário na tabela é candidato a sair (ou a virar cenário nomeado).

### 4. Triagem dos achados

Para cada `erro` e `aviso` do driver: abra o trecho com `Read` (offset/limit), confirme e classifique — confirmado, falso positivo (com o motivo) ou fora do escopo. Critérios que o driver não tem:

- **`eco-do-mock`** é aceitável quando a unidade só repassa e o nome do `it` diz isso ("returns the reader's list untouched"). Se ela filtra, ordena ou calcula, o teste tem que conferir a transformação.
- **`so-verifica-chamada`** vira `toHaveBeenCalledWith(argumentos)` ou asserção do efeito. Callback de UI ("closing notifies the opener") pode ficar em `toHaveBeenCalledTimes(1)` **se** o `it` também prova que o callback **não** dispara no cenário oposto.
- **`assercao-fraca`** em `not.toBeNull()` sobre `screen.getByText('x')` já é forte (a query carrega o esperado); o driver sabe disso. `toBeDefined()` sobre retorno de função nunca é.
- **`assercao-tautologica`** com chamada dos dois lados (`expect(f()).toEqual(f())`) só prova determinismo; se é isso que o cenário quer (regra do game-core que precisa dar o mesmo resultado no server e no client), o nome diz.
- **`fonte-sem-spec`** em borda do server (`*.routes.ts`, `*.gateway.ts`) e em DAO: provadas pela integração (`server/test/integration/`), com app real e Postgres real; registre qual spec de integração cobre em vez de criar unit vazio. O driver já dispensa `*.plugin.ts`, `*.po.ts`, arquivo só de tipos, `index.ts` e DTO sem `refine`/`transform` próprio.
- **`spec-sem-espelho`** é válido para cenário transversal; se espelha um arquivo, renomeie para o nome dele.

### 5. Escrever ou corrigir os specs

Anatomia de um `it` que vale:

```ts
it('player moving a token they do not control is refused with NOT_TOKEN_CONTROLLER', () => {
  const token = tokenPo({ controllers: ['user-gm'] });
  const move = () => new TokenBo(token).moveBy('user-player', gridPosition(3, 4));
  expect(move).toThrow(expect.objectContaining({ code: 'NOT_TOKEN_CONTROLLER' }));
});
```

- **Arrange** com fábrica (`<workspace>/test/support/`) ou fake nomeado; literal inteiro de PO ou DTO não entra no spec.
- **Act** uma vez; **assert** o resultado observável: retorno, exceção com código e valor, DOM (`toHaveTextContent`), chamada **com argumentos**, estado depois.
- O valor esperado é **escrito à mão** (`25`), nunca calculado com a mesma função ou copiado do mock.
- Mesma regra, várias entradas: `it.each` com o cenário no placeholder (`'initiative %s puts the combatant first'`).
- Preparação repetida vai para `beforeEach` ou fábrica; `it` acima de 40 linhas úteis é dois cenários.

Anti-padrões que saem (o "testa por testar"):

| cheiro                                                                                               | por que não prova                     | o que fazer                                                         |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| sem `expect`                                                                                         | passa sempre                          | asserir o resultado ou apagar                                       |
| `expect(x).toBe(x)`                                                                                  | compara a coisa com ela mesma         | esperado à mão                                                      |
| confere o que o mock devolveu                                                                        | prova só que a chamada passou adiante | asserir a transformação                                             |
| só `toHaveBeenCalled()`                                                                              | qualquer argumento passa              | `toHaveBeenCalledWith` ou o efeito                                  |
| só `toBeDefined`/`toBeTruthy`                                                                        | `{}` e `'x'` passam igual             | `toBe`/`toEqual` do valor                                           |
| só snapshot                                                                                          | não diz qual comportamento importa    | asserir o texto/estado prometido                                    |
| testa o framework (`z.string()` aceita string, Drizzle devolve linha, React renderiza, Pixi desenha) | prova a lib, não o projeto            | testar o que o projeto acrescenta                                   |
| testa detalhe interno (ordem de métodos privados, nome de variável de estado)                        | quebra em refatoração sem bug         | testar o comportamento pela porta pública                           |
| só o caminho feliz                                                                                   | o bug mora na borda e no erro         | um `it` por recusa e por limite                                     |
| `it` criado para "cobrir a linha"                                                                    | não corresponde a cenário nenhum      | achar o cenário; sem cenário, a linha é código morto (`/refatorar`) |

### 6. Verificar

Rode da raiz, nesta ordem:

1. **O spec novo/alterado sozinho** (comandos em "Verificação por workspace"). Em modo cobrir de comportamento novo, ele **falha** aqui; confirme que a mensagem é a da asserção, não `import` quebrado ou `TypeError`.
2. **A prova de que o teste morde** (regra 1): para cada regra nova provada, uma inversão proposital na fonte (`>` por `>=`, trocar o código de erro) deixa o `it` vermelho. Desfaça a inversão.
3. **Driver de novo no alvo com `--min aviso`**: os achados tratados sumiram e nenhum novo apareceu.
4. **`pnpm test` + `pnpm typecheck`**: o transpile do Vitest não checa tipo, e campo novo obrigatório passa verde até o `tsc`.

Se uma correção falhar duas vezes, pare, releia a fonte e o doc da área inteiros e diga qual premissa estava errada (CLAUDE.md).

### 7. Fechamento

Entregue: a tabela cenário → `it` (o que ficou provado, o que ficou pendente e por quê); os achados descartados com o motivo em uma linha; bugs encontrados como itens separados com o teste de regressão vermelho que os prova. Padrão de teste ruim corrigido vai para a seção "Armadilhas" da área (`docs/context/<área>/armadilhas*.md` ou a seção no `<área>.md`). Fábrica ou fake compartilhado que mudou (`test/support/`) entra no doc da área.

## Teste quebrou: entender antes de corrigir

Teste vermelho pode ser a regressão que ele existe para pegar. Antes de tocar no spec:

1. **Rode o spec isolado** (comandos abaixo). Falha só na suíte inteira é ordem ou carga, não regressão.
2. **Leia a asserção que falhou e o `git diff`.** A linha do `expect` diz qual cenário quebrou; o diff diz se a mudança toca a regra.
3. **Classifique** e só então aja:

| o que aconteceu                 | sinal                                                                                 | ação                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Regressão no código             | a mudança toca a regra e o cenário do `it` continua desejado                          | corrigir o código; o teste fica como está                                                                 |
| Mudança de contrato intencional | o cenário antigo deixou de ser o comportamento pedido                                 | atualizar a asserção **e** dizer na mensagem do commit qual comportamento mudou; `docs/context` acompanha |
| Teste frágil                    | quebra por rename, ordem de chamada, `mock.calls[0]`, texto de UI que não é o cenário | reescrever a asserção sobre o resultado observável; armadilha se for padrão                               |
| Ambiental                       | passa isolado; timeout de hook; integração sem Postgres de pé                         | ver Gotchas; reproduza num spec **não tocado** para provar                                                |

Spec que muda só por rename é ajuste; spec que muda de **asserção** é mudança de comportamento e precisa de justificativa explícita. Nunca "arrume" o teste para passar sem saber qual linha da tabela é.

## Verificação por workspace (comandos verificados em 14/10/2026)

O Vitest roda da raiz, com os `projects` do `vitest.config.ts` (`client`, `server`, `packages/contracts`, `packages/game-core`). Spec isolado e projeto inteiro:

```bash
pnpm exec vitest run packages/game-core/test/grid-position.vo.spec.ts
pnpm exec vitest run --project @lorkarium/game-core     # o nome do projeto é o nome do pacote
pnpm test                                               # todos os workspaces
pnpm typecheck                                          # tsc em cada workspace
```

`--project packages/game-core` (pela pasta) **não** funciona: é pelo `name` do `package.json`.

Prova de que o teste morde (regra 1). O repo pode ter arquivo ainda não commitado, então a restauração é por cópia no scratchpad, nunca `git stash` nem `git checkout --` em arquivo que o git não conhece:

```bash
cp packages/game-core/src/turn-cycle.ts "$SCRATCHPAD/turn-cycle.ts.bak"
sed -i 's/index + 1 < order.length/index + 1 <= order.length/' packages/game-core/src/turn-cycle.ts
pnpm exec vitest run packages/game-core/test/turn-cycle.spec.ts   # 1 failed: o cenário da borda
cp "$SCRATCHPAD/turn-cycle.ts.bak" packages/game-core/src/turn-cycle.ts
```

Cobertura é só relatório: `pnpm test:packages`, `test:client` e `test:server` rodam com `@vitest/coverage-v8`, sem limiar. A régua continua sendo a tabela de cenários do passo 3; linha descoberta é pista para achar cenário, nunca motivo para um `it`.

Integração do server: nunca contra o banco do `pnpm db:up`, que é o de desenvolvimento. Postgres descartável numa porta própria, em memória. O `pnpm test` não roda a integração; ela é o projeto `@lorkarium/server-integration`:

```bash
MSYS_NO_PATHCONV=1 docker run -d --name lorkarium-testar -e POSTGRES_USER=lorkarium -e POSTGRES_PASSWORD=lorkarium -e POSTGRES_DB=lorkarium -p 5434:5432 --tmpfs /var/lib/postgresql/data postgres:17-alpine
export DATABASE_URL=postgres://lorkarium:lorkarium@localhost:5434/lorkarium
# S3 descartável (o buildApp garante o bucket no onReady; todo spec de integração precisa dele)
MSYS_NO_PATHCONV=1 docker run -d --name lorkarium-testar-s3 -p 8334:8333 --tmpfs /data -v "$PWD/infra/compose/seaweedfs/s3.json:/etc/seaweedfs/s3.json:ro" chrislusf/seaweedfs:4.48 server -dir=/data -ip.bind=0.0.0.0 -master.volumeSizeLimitMB=64 -volume.max=200 -s3 -s3.config=/etc/seaweedfs/s3.json -s3.port=8333
export S3_ENDPOINT=http://localhost:8334 S3_BUCKET=lorkarium-test S3_ACCESS_KEY_ID=lorkarium S3_SECRET_ACCESS_KEY=lorkarium-dev-secret
# Mailpit descartável (só o smtp-mailer.spec.ts fala com ele; o padrão do spec é 1026/8026)
docker run -d --name lorkarium-testar-mail -p 1026:1025 -p 8026:8025 axllent/mailpit:v1.27.0
pnpm db:migrate                       # opcional: o openTestDatabase (test/support) já migra; o DATABASE_URL exportado vence o server/.env
pnpm exec vitest run server/test/integration/<area>.spec.ts   # ou pnpm test:integration (todos)
docker rm -f lorkarium-testar lorkarium-testar-s3 lorkarium-testar-mail
```

## Autoteste do driver

```bash
node .claude/skills/testar/autoteste.mjs
# -> autoteste ok: 25 achados na fixture, 19 regras distintas, todos onde deviam
```

Ele roda o driver em `fixtures/monorepo/` (server sem alias, client com `@/*`, game-core e contracts), com specs propositalmente ruins (`combat.service.spec.ts`, `token-badge.spec.tsx`, `sum-values.spec.ts`) e specs limpos que precisam sair em silêncio (`turn-order.bo.spec.ts`, `test/integration/combat.spec.ts`, `grid-position.vo.spec.ts`), e confere regra por regra o que dispara, o que cala e quantas vezes. Também falha se alguma regra disparar sem expectativa declarada. **Regra nova ou ajuste de limiar entra com uma linha na fixture e uma expectativa aqui.**

## Como o driver funciona

- Reaproveita da skill `refatorar` o `lib/ambiente.mjs` (workspace do alvo, tipo, aliases, `typescript`), o `lib/contextos.mjs` (o `leia antes:`) e o formato de achado de `lib/achados.mjs`.
- `lib/espelho.mjs` decide quem espelha quem: todo workspace tem os specs em `test/` espelhando `src/`; `a-without-owner.spec.ts` espelha `a.ts` (prefixo mais longo ganha); sem nome parecido, vale o primeiro import que aponte para a mesma pasta. `test/integration/`, `test/support/` e `test/setup.ts` não têm espelho por desenho. Fontes que dispensam spec: `index.ts`, `src/main.tsx`, `*.plugin.ts`, `*.po.ts`, `src/generated/`, `src/components/ui/`, `src/lib/utils.ts` (shadcn), DTO sem `refine`/`transform`/`check`/`pipe` e arquivo só de tipos.
- `lib/leitura-de-specs.mjs` lê cada spec com o parser sintático: `it`/`test` (com `skip`/`only`/`todo`/`each` e os prefixos `xit`/`fit`), `describe`, ganchos, a cadeia de cada `expect` (matcher, `not`, alvo, argumento), os valores devolvidos por `mockResolvedValue`/`mockReturnValue`/`mockImplementation`, `vi.mock`, e `new X({ f: vi.fn() })`.
- Uma categoria por arquivo: `regras-de-lugar.mjs`, `regras-de-prova.mjs`, `regras-de-cenario.mjs`; o espelho é montado no `driver.mjs`. `relatorio.mjs` imprime texto ou JSON.

## Gotchas

- **Função asseguradora não é "sem asserção".** Função local ou importada de arquivo relativo cujo nome começa com `espera`, `assert`, `confere`, `verifica`, `garante` ou `expect` e que contém `expect` por dentro conta como asserção para quem a chama. `expect.assertions(n)` também.
- **`it.each` com `%s`/`$campo` no nome não é `nome-sem-cenario`**: o placeholder carrega o cenário. `it.each` sem placeholder e com nome curto dispara.
- **`eco-do-mock` olha os ganchos também.** Valor devolvido em `beforeEach` e conferido no `it` conta; primitivos (`null`, `true`, `1`, `''`, `[]`, `{}`) não contam, senão todo `toBe(true)` viraria eco.
- **`mock-da-unidade-sob-teste` resolve alias e relativo.** `vi.mock('@/lib/x')` num spec de `test/lib/x.spec.ts` é o próprio arquivo; `vi.mock` de um serviço do client num spec de componente é dependência e passa.
- **`spec-importa-src-relativo` não dispara no server nem nos pacotes** enquanto eles não tiverem alias no `tsconfig.json`: o relativo é o único caminho.
- **O client roda em `jsdom`** (bloco `test` do `client/vite.config.ts`, setup em `client/test/setup.ts` com `cleanup` explícito, porque não há globals). Os matchers do jest-dom são tipados por `client/test/jest-dom.d.ts` (o jest-dom 7 aumenta `Assertion<T>`, e o Vitest 5 só aceita `Matchers<R, T>`).
- **PixiJS não é testado pelo desenho.** O que se prova no renderer é a parte pura (mundo ↔ tela, diff do que mudou entre dois estados, qual objeto recriar); `Application` e WebGL ficam fora do unit.
- **`regressao-sem-referencia` procura no nome e nos comentários do `it`** por `#123`, SHA de 7+ hex, data (`2026-10-14` ou `14/10/2026`), `§5.4`, `issue`, `PR` ou `armadilha`. Comentário acima do `it` conta.
- **`cenario-longo` mede linhas úteis** (sem vazias nem comentários), teto 40. A saída é fábrica ou `beforeEach`, não apagar asserção.
- **`vi.mock` é içado**: a fake mora dentro da fábrica do mock.
- **Caminho no Windows**: alvo relativo com barra normal; o relatório imprime `arquivo:linha` clicável. Saída piped some se o runner pendura: redirecione para arquivo no scratchpad e leia depois.

## Troubleshooting

- **`typescript não encontrado a partir de …`**: `pnpm install` na raiz. O driver não instala nada.
- **`Nenhum package.json com pasta src/ acima de …`**: o alvo está fora de um workspace. Aponte para dentro de `client/`, `server/` ou `packages/<pacote>/`.
- **`Alvo X não existe`**: o caminho é relativo à raiz do repo (`server/src/modules/combat`, não `src/modules/combat`).
- **`categoria "x" inválida`**: os nomes válidos são `lugar`, `espelho`, `prova`, `cenarios` (sem acento).
- **O espelho aponta spec errado**: o pareamento é por prefixo do nome; spec `combat-turns.spec.ts` espelha `combat.ts` se `combat-turns.ts` não existe. Renomeie o spec para o nome da fonte ou aceite o pareamento por import.
- **`No projects were found … The filter matched no projects: packages/game-core`**: o `--project` é o `name` do pacote (`@lorkarium/game-core`), não a pasta.
