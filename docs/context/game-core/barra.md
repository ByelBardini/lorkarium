# Game-core — barra

Índice: [`game-core.md`](../game-core.md).

Fontes: `src/bar.ts` (ajuste, débito em lote) e `src/manifest-bars.ts` (rótulo e barras do manifesto da ficha). Specs em `test/bar.spec.ts` e `test/manifest-bars.spec.ts`.

## Ajuste

- `BarChange` = `{ op: 'add', amount }` ("−7", "+5") | `{ op: 'set', value }` ("12"). `applyBarChange(atual, mudança, limite)` devolve o valor novo: **livre** (negativo e acima do máximo valem, nada automático no zero, spec §2.1), só travado em ±`limite`. O limite vem por parâmetro (`BAR_VALUE_LIMIT` do contracts), porque o game-core não importa o contracts. Valor não inteiro lança `RangeError` citando o valor.
- `BarAdjustment` = `BarChange` | `{ op: 'max' | 'temp', value }`; `adjustBarValues({ current, max, temp }, ajuste, limite)` devolve os três: `max` (1 a `limite`) e `temp` (0 a `limite`) trocam só o seu (fora → `RangeError`); a subtração gasta o temp antes do atual; o resto passa pelo `applyBarChange` ([`../tokens/temp.md`](../tokens/temp.md)).

## Débito em lote (`spendBars`)

- `spendBars(barras, custos)` → `{ ok: true, spent }` | `{ ok: false, bar, has, needs }`. Tudo ou nada: cada barra (`SpendableBar` `{ id, label, current }`) precisa ter no **atual** a soma dos seus custos (`BarCost` `{ barId, amount }`; a mesma barra repetida soma); o **temp nunca paga** (PV 2 + temp 5 não paga 3). A primeira barra que falta volta pelo rótulo, com o saldo e o custo, e nada muda. `spent` traz cada barra que pagou uma vez, na ordem de `barras`, só com `current` trocado (temp e máximo ficam).
- Custo não inteiro ou menor que 1 → `RangeError` "Bar cost 0 is invalid: expected a whole number of at least 1."; custo numa barra que não está na lista → `RangeError` citando o id e os que existem (o server confere antes e responde `BAR_NOT_FOUND`).
- Usado pelo `sheet:spendBars` do server (`sheet-bars.bo.ts`, ver [`../sheets/server.md`](../sheets/server.md)).

## Rótulo e barras do manifesto

- `barLabelKey(rótulo)` — o rótulo como se compara: NFD sem marcas `\p{M}`, `trim`, minúsculas ("Pontos de Ação " = "pontos de acao"). O `resolveSheetBar` do client (`bars.adjust` por nome) usa este; o bootstrap da ficha tem cópia própria porque é serializado no frame e não importa nada.
- `missingManifestBars(existentes, manifesto, teto)` → `{ added, skipped }`: as barras do manifesto que o dono não tem (pelo `barLabelKey`), na ordem do manifesto, até `teto` barras no total; as que faltam e não cabem voltam em `skipped` pelo rótulo. As existentes nunca mudam; rótulo repetido no manifesto entra uma vez. Genérica no tipo (a entrada do manifesto volta inteira, com cor e máximo). Teto que não é inteiro ≥ 1 → `RangeError` citando o valor.
