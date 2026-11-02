# Valor temporário da barra

O HP temporário do spec §3.6, generalizado: toda barra (de token ou de personagem) tem um `temp`, uma camada sobre o `current`. Regra no game-core ([`adjustBarValues`](../game-core.md)); hub em [`tokens.md`](../tokens.md).

## Regra

| Ajuste (`barChangeDto`)            | Em PV 20 +5 de 45 | O que acontece                                                |
| ---------------------------------- | ----------------- | ------------------------------------------------------------- |
| `{ op: 'add', amount: -3 }` ("−3") | 20 +2             | a subtração gasta o temp primeiro                             |
| `{ op: 'add', amount: -8 }` ("−8") | 17 +0             | o que passa do temp sai do atual                              |
| `{ op: 'add', amount: 4 }` ("+4")  | 24 +5             | a soma vai só ao atual, **nunca** ao temp                     |
| `{ op: 'set', value: 12 }` ("12")  | 12 +5             | definir o atual não toca o temp (não é dano: ignora a camada) |
| `{ op: 'temp', value: 9 }`         | 20 +9             | o campo "Temp" substitui o valor, sem somar nem acumular      |
| `{ op: 'max', value: 50 }`         | 20 +5 de 50       | o máximo não toca o temp                                      |

O `temp` é inteiro de 0 a `BAR_VALUE_LIMIT`, sem relação com o `max`: passar do máximo vale. Fora disso, o DTO recusa na borda e o `adjustBarValues` lança `RangeError` citando o valor.

## Onde mora

- **DTO:** `temp` no `barInputDto` (padrão 0, logo no `tokenBarDto` também) e `op: 'temp'` no `barChangeDto`, que serve aos três comandos: `token:adjustBar`, `character:adjustBar` e `sheet:adjustBar`. O SDK da ficha aceita a mesma forma em `bars.adjust`.
- **Tabelas:** coluna `temp` (`integer not null default 0`, migração `0078_bar_temp`) no `barColumns()`, ou seja, em `token_bars` e `character_bars`. Ligar, desligar e duplicar copiam as colunas por `getTableColumns`, então o temp vai junto sem código próprio.
- **Redação:** o temp anda com a barra. Barra `controllers` não chega a `others`, e o temp também não; não há regra própria.
- **Permissão:** a mesma do ajuste da barra (`requireControl` / `requireEdit`).

## Client

- `barFill` devolve `temp` (a fração do máximo, até uma barra inteira). `BarTrack` desenha uma faixa clara (`--bar-temp`, `data-bar-temp`) na metade de cima da barra; no tabuleiro é o segmento `temp` do `barSegments`, em `BAR_TEMP_HEIGHT` (`pixi-token-layer.ts`), e `sameBar` (`token-redraw.ts`) o compara para redesenhar.
- `formatBarValue`: "32 +5 / 45"; em percentual, "71% +11%"; com os números, "71% +11% · 32 +5 / 45". Sem temp, o texto de sempre.
- Campo "Temp" no balão (`BarQuickEdit`) e no diálogo (`BarRowFields`, `tempText`), pelo `parseBarTemp`: vazio é 0; fora de 0 a 99 999 → `BAR_TEMP_PROBLEM`.
- `summedBarOf` soma os temps da entrada de grupo; `copiedOf` leva o temp na cópia.

## Armadilhas

- `token:update` troca as barras inteiras: o diálogo **precisa** devolver o `temp` que abriu (`barFormsOf` → `tempText` → `barDraftsOf`), ou salvar o token zeraria o temporário. O `token-form-state.spec.ts` prova ("saving the dialog keeps the temp").
- Como `display`, o `temp` tem padrão no DTO: o tipo de saída o exige, então toda fixture de `BarInputDto`/`TokenBarDto` precisa do campo, e todo `toEqual` de um `parse` passa a vê-lo.
