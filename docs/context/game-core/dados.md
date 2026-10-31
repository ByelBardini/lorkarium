# Game-core: dados

Detalhe do hub [`game-core.md`](../game-core.md). A regra dos dados é pura: o game-core lê a notação, conduz a rolagem em ondas e aplica vantagem; **quem rola** (física ou crypto no server) entra só com os valores. Server e client leem a mesma notação.

## Notação (`dice-notation.ts`)

- `parseDiceExpression(texto)` → `DiceExpressionTerm[]` (termos que se somam). `DiceTerm` `{ kind: 'dice', sign, count, sides, keep?, drop?, explode?, reroll?, success? }` e `NumberTerm` `{ kind: 'number', sign, value }`; `sign` é `1 | -1`. `keep`/`drop` são `DiceSelection` `{ which: 'highest' | 'lowest', count }`; `explode`/`reroll`/`success` são `DiceComparison` `{ op, target }`. O modificador ausente **não existe** no objeto (não é `undefined`).
- Gramática (sem caixa: `D`, `KH` valem; espaço e tab só em volta de `+`/`-`):

  ```
  expressão := [+|-] termo ( (+|-) termo )*
  termo     := [N] 'd' (N | '%') modificador*  |  N
  modificador := 'k' ['h'|'l'] [N] | 'd' ('h'|'l') [N] | '!' [comparação] | 'r' [comparação] | op N
  comparação  := [op] N        op := '>=' | '<=' | '>' | '<' | '='
  ```

- **Precedência:** os modificadores grudam no dado antes da aritmética: `4d10dl2+2` é `(4d10dl2)+2`. A comparação logo depois de `!` ou `r` é deles; uma comparação solta é a de sucessos: `8d10!10>=7` explode no 10 e conta ≥ 7. Os modificadores vêm em qualquer ordem, cada um uma vez só.
- **Padrões:** `d20` = `1d20`; `d%` = `d100` (`sides: 100`); `k`/`kh` e `dh`/`dl` sem número = 1; `!` sozinho = explode no máximo (`{ op: '=', target: sides }`); `r` sozinho = rerrola o 1; `!5`/`r1` sem op = `=`. Sucesso exige op (`=6`, `>=7`).
- `formatDiceExpression(termos)` escreve de volta na forma canônica (minúscula, sem espaço, `d%` → `1d100`, `!` quando explode no máximo); ler o resultado devolve os mesmos termos. O `!` sozinho toma a comparação logo depois dele, então antes de um sucesso a face é escrita: `8d10!10>=7` fica `8d10!10>=7` (`8d10!>=7` explodiria em ≥ 7 e perderia o sucesso), e com `r` no meio volta o `!` sozinho (`8d10!r1>=7`). O `withAdvantage` e o `client/src/lib/dice-tray.ts` passam por aqui. `diceComparisonMatches(comparação, valor)` é o teste de explosão, rerrolagem e sucesso.
- `DICE_LIMITS` `{ maxDice: 1000, minSides: 2, maxSides: 1000, maxExplosions: 100, maxNumber: 9999, maxLength: 200 }`: teto técnico (protege o server), não regra de produto. O contracts não importa o game-core: se repetir um limite, repete o número.

### Erros

`DiceNotationError` (um `RangeError`) com `position` (o caractere onde a leitura parou) e `part` (`null` numa expressão; o índice da peça no `parseDiceParts`). As mensagens citam o valor e o esperado:

| Entrada                  | Mensagem                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `''`, `'   '`            | `Dice expression is empty: expected a die or a number.`                                       |
| `'2d'`                   | `Expected the number of sides at position 2; got the end of the expression.`                  |
| `'1d6+'`                 | `Expected a die or a number after '+' at position 4; got the end of the expression.`          |
| `'abc'` / `'1d6 x'`      | `Expected a die or a number at position 0; got 'a'.` / `Expected '+' or '-' at position 4; …` |
| `'0d6'`, `'1001d6'`      | `Dice count 0 at position 0 is invalid: expected 1 to 1000.`                                  |
| `'1d1'`, `'1d1001'`      | `Dice sides 1 at position 2 is invalid: expected 2 to 1000.`                                  |
| `'6d6kh7'`               | `Keep 7 at position 3 on 6 dice is invalid: expected at least 1 and at most 6.`               |
| `'4d6dl4'`               | `Drop 4 … expected at least 1 and at most 3 (one die must stay).`                             |
| `'1d6kh1dl1'`            | `Keep and drop together at position 6: expected only one of them.`                            |
| `'1d6!!'`                | `Modifier 'explode' appears twice at position 4: expected it at most once.`                   |
| `'1d6!>=1'`              | `Explosion '!>=1' at position 3 on d6 always explodes: expected a target above 1.`            |
| `'1d6>=0'`               | `Target 0 at position 5 is invalid: expected 1 to 1000.` (alvo de 1 a 1000)                   |
| `'10000'`, `'1d6-10000'` | `Number -10000 at position 4 is out of range: expected -9999 to 9999.`                        |
| 201 caracteres           | `Dice expression has 201 characters: expected at most 200.` (posição 200)                     |

O keep vai de 1 à quantidade de dados (`6d6kh6` vale, mesmo sem efeito); o drop deixa pelo menos um dado. A explosão que pegaria **toda** face é recusada (laço infinito); a que nunca pega (`1d6!>=7`) passa.

## Rolagem em ondas (`dice-roll.ts`)

Máquina de estados pura: `startDiceRoll(expressões)` valida pelo `parseDiceParts` e devolve um `DiceRollStep`; `continueDiceRoll(estado, valores)` pousa os valores e devolve o próximo passo. Nenhum dos dois muta o estado recebido (o mesmo estado pode ser continuado duas vezes).

- `DiceRollStep` = `{ kind: 'pending', state, requests: DieRequest[] }` | `{ kind: 'done', state, result: DiceRollResult }`. Só números (`['+2']`) já nasce `done`.
- `DieRequest` `{ part, term, sides }`: os índices da peça e do termo e as faces (d100 → `sides: 100`; como lançar, dois d10 ou um modelo, é de quem rola). Os valores chegam **na ordem dos pedidos**, um por pedido; cada dado entra no fim do seu termo.
- **Ondas:** um dado que explode pede mais um do mesmo termo; um que cai na rerrolagem pede o substituto. O substituto não rerrola de novo (`r` rerrola **uma vez**: `1d20r1` com 1 e 1 dá 1), mas pode explodir; o dado extra da explosão pode rerrolar. Teto de `maxExplosions` (100) dados extras de explosão **na rolagem inteira**: o dado que pegaria a 101ª fica `kept`.
- **Manter/descartar** vale sobre todo o monte do termo (originais + explosões, sem os rerrolados), na hora de fechar: `2d6!kh1` com 6, 3 e 5 mantém só o 6. Empate: o dado anterior é o escolhido — no keep ele fica (`2d20kl1` com 5 e 5 mantém o 1º), no drop ele sai (`2d20dh1` com 5 e 5 descarta o 1º; só o keep tem spec).
- `DieStatus`: `rerolled` (trocado, não conta) → `dropped` (perdeu a seleção) → `exploded` (conta e gerou outro) → `kept` (conta), nesta precedência.
- **Sucessos:** com comparação solta, o termo vale a **contagem** dos dados contados que passam (`8d10>=7` com 7, 10, 3, 6, 7, 1, 9, 2 → 4; `+2` soma ao número: 6). `success` só existe no dado contado; o descartado e o rerrolado não têm.
- `DiceRollResult` `{ parts: RolledPart[], total }`; `RolledPart` `{ expression, terms, dice, total }` (`dice` = os dados de todos os termos, na ordem); `RolledTerm` = `{ kind: 'dice', term, dice, total }` | `{ kind: 'number', term, total }`; `RolledDie` `{ sides, value, status, success? }`. O total do termo já leva o sinal (`10-1d4` com 3 → 7). É o que o mapper do server põe no `diceRolledDto` (rótulo é do server, não da regra).
- Erros (`RangeError`): `Dice roll expected 2 values, got 1.`; `Die value 7 for request 0 (d6) is invalid: expected a whole number from 1 to 6.` (inteiro de 1 a `sides`); `Dice roll is already done: expected a roll that still asks for dice.`

## Peças e vantagem (`dice-advantage.ts`)

- `parseDiceParts(expressões)` → `ParsedDicePart[]` (`{ expression, terms }`): de 1 a `DICE_PARTS_MAX` (10) peças e até `maxDice` (1000) dados **somando as peças** (`600d6` + `400d6` passa, `+401d6` não). Erros (`DiceNotationError`, `part: null`): `Dice roll has 11 parts: expected 1 to 10.`, `Dice roll has 1001 dice: expected at most 1000.` Erro dentro de uma peça vira `Dice part 1 ('2d'): <mensagem da notação>`, com `part: 1` (índice a partir de 0) e a `position` original.
- `advantageBlockOf(expressões)` → `AdvantageBlock | null`: `'no-dice'` (nenhum termo de dado), `'modified'` (o **primeiro** termo de dado já tem keep, drop, `!`, `r` ou sucesso), `'too-many-dice'` (mais um dado passaria de 1000); `null` = pode. Expressão ilegível lança o erro do `parseDiceParts` (o client lê a notação antes).
- `withAdvantage(expressões, 'advantage' | 'disadvantage')`: o primeiro termo de dado da rolagem (pula a peça sem dado) ganha um dado e mantém a quantidade de antes: `1d20+5` → `2d20kh1+5`, `3d6` → `4d6kh3`, `kl` na desvantagem. Só a peça mexida é reescrita, na forma canônica; as outras voltam como vieram. Composição bloqueada → `RangeError` "Cannot apply advantage to [\"1d6!\"]: blocked by 'modified'; …". O sinal do termo fica (um `-1d4` com vantagem vira `-2d4kh1`).

## Formas e numeração (`dice-shapes.ts`)

- `dieShapeOf(tipo)` → `DieShape` `{ kind, reads, vertices, faces, vertexValues }`, o mesmo poliedro na física do server e na malha do client. Cada `DieFace` tem normal, âncora e `value`. Memoizado e **compartilhado**; o congelamento é raso (o objeto, cada face e o `vertexValues`; os arrays `vertices`/`faces` e os vetores não): não mute. Tipo sem modelo (`'d7'`) → `RangeError`. Vértices anti-horários vistos de fora; faces em ordem fixa (de cima para baixo, depois pelo ângulo em volta de y).
- `DIE_KINDS`, `isDieKind(texto)` (guarda de tipo), `DIE_UP` (`{ 0, 1, 0 }`) e `dot3(a, b)` — este exportado pelo `dice-shapes.ts` mas **fora** do `index.ts` (o renderer tem cópia, `dot` em `packages/dice-renderer/src/die-geometry.ts`).
- **Numeração como a do dado físico:** faces opostas somam N + 1 no d6 (7), d8 (9), d12 (13) e d20 (21). O **d10** é impresso de 0 a 9 com opostas somando 9 (0↔9, 1↔8…), como o `d100tens` (00↔90); a face "0" vale **10** no `value`. O d4 vale pela face de baixo (`reads: 'bottom'`), lida no canto de cima (`vertexValues`: cada canto leva o valor da face oposta). O d10 **não** segue N + 1 no `value` (o 10 é o "0" impresso, oposto ao 9): o spec confere a soma sobre o número impresso (`value % 10`).

## Repouso (`dice-rest.ts`)

- `Quaternion` `{ x, y, z, w }` (o de cannon-es e three), `IDENTITY_QUATERNION`. `unitQuaternion(q)`: norma 1 ± 0,001 (a deriva do integrador) e devolve renormalizado; fora → `RangeError`. `quaternionFromAxisAngle(eixo, graus)` (eixo não precisa ser unitário; nulo → `RangeError`), `rotateVector(q, v)`.
- `restingValueOf(tipo, orientação)` → `{ value, tiltDegrees }`: a face virada para cima (no d4, a de baixo) e a inclinação dela. Relançar o dado inclinado é decisão da física, não daqui.
- `percentileValue(dezenas, unidades)`: dezenas 0, 10 … 90 (o `d100tens`), unidades 0 a 9 (passe `d10 % 10`); 00 + 0 = 100. Fora → `RangeError` citando o valor.

## Trajeto (`dice-frames.ts`)

- `DicePose` `{ position, quaternion }` em unidades da caixa. `DICE_FRAMES_PER_SECOND` (30), `DICE_FRAME_MS` (1000/30), `DICE_POSE_STRIDE` (7 inteiros por pose), `DICE_POSITION_LIMIT` (±32), `DICE_POSITION_SCALE` (1000: milésimos), `DICE_QUATERNION_SCALE` (32767).
- `encodeDiceFrames(poses)` → inteiros (centro fora de ±32 ou quaternion fora da tolerância → `RangeError`); `decodeDiceFrames(inteiros)` → poses com o quaternion renormalizado (tamanho que não é múltiplo de 7 ou valor não inteiro → `RangeError`). **`[]` decodifica para `[]`**, mas o DTO exige ao menos uma pose e o `poseAt` lança "Dice poses are empty".
- `poseAt(poses, tMs, startMs, frameMs = DICE_FRAME_MS)`: `null` antes do início, a última pose depois do fim, e no meio lerp na posição + slerp pelo arco curto. É o playback do client (`dice-playback.ts`).

## Caixa da física (`dice-box.ts`)

`diceBoxOf(aspect)` → `{ halfWidth, halfDepth }` em unidades do dado (raio circunscrito 1): o lado curto mede sempre `DICE_BOX_SHORT_SIDE` (16) e o longo cresce com o aspecto (largura ÷ altura da janela de quem rolou), de `DICE_BOX_ASPECT_MIN` (0,5) a `DICE_BOX_ASPECT_MAX` (3); fora disso (ou `NaN`) → `RangeError` `Dice box aspect 0 is invalid: expected 0.5 to 3.` O server monta a caixa da física com ela e o client encaixa a mesma caixa na tela; detalhe em [`dice/fisica.md`](../dice/fisica.md).
