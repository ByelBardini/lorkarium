# Game-core

Regra de jogo pura, calculada igual no server e no client. Vive em `packages/game-core/src/`, exportada por `@lorkarium/game-core` (`src/index.ts` reexporta tudo). Sem nenhuma dependência de runtime (nada de React, PixiJS, Fastify, Socket.IO ou `node:`). Specs em `packages/game-core/test/`, unit puro.

## Estrutura

- `src/cell.vo.ts` — a célula do grid (VO)
- `src/grid.ts` — distância entre células e pegada do token na cena
- `src/bar.ts` — ajuste de barra (PV e qualquer outra)
- `src/initiative.vo.ts` — o valor da iniciativa (VO)
- `src/initiative-order.ts` — a ordem de turno e o empate
- `src/turn.ts` — avançar e voltar turno, sair do combate, duração de condição

## Célula e grid

- `Cell` `{ col, row }` — coluna e linha a partir do canto superior esquerdo, inteiros ≥ 0. `cell(col, row)` devolve o valor congelado e lança `RangeError` citando o eixo e o valor recebido quando não é "inteiro ≥ 0". `sameCell(a, b)` compara pelo valor.
- `SceneSize` `{ widthCells, heightCells }` — tamanho da cena em casas.
- `cellDistance(a, b)` — distância em casas com a diagonal valendo 1 (Chebyshev): `(0,0)` → `(3,2)` = 3. É a régua do §3.2; outras regras de diagonal são do §12.
- `footprintFits(scene, origin, size)` — o token é um quadrado de `size` casas ancorado no canto superior esquerdo (`origin`); cabe se `origin + size ≤` largura/altura. Encostar na última coluna cabe. `size` que não é inteiro ≥ 1 lança `RangeError`. Sem colisão entre tokens (colisão é do §12).

## Barra

- `BarChange` = `{ op: 'add', amount }` ("−7", "+5") | `{ op: 'set', value }` ("12"). `applyBarChange(atual, mudança, limite)` devolve o valor novo: **livre** (negativo e acima do máximo valem, nada automático no zero, spec §2.1), só travado em ±`limite`. O limite vem por parâmetro (`BAR_VALUE_LIMIT` do contracts), porque o game-core não importa o contracts. Valor não inteiro lança `RangeError` citando o valor.

## Combate

- `initiative(valor)` — inteiro de −999 a 999 (`INITIATIVE_LIMIT`) ou `null` (ainda não rolou); fora disso, `RangeError` citando o valor e "−999…999".
- `orderCombatants(lista)` — do maior para o menor, sem iniciativa no fim, empate pela `tieOrder` (a ordem de entrada); `moveWithinTie(lista, id, 'up' | 'down')` troca a `tieOrder` com o vizinho **só** se tiver a mesma iniciativa (o ↑/↓ do mestre). `OrderEntry` = `{ id, initiative, tieOrder }`.
- `TurnState` `{ round, currentId }` — a vez segue o combatente, não a posição: mudar a iniciativa no meio da rodada não muda quem joga.
- `advanceTurn(ordem, estado)` → o próximo, e o primeiro com `round + 1` depois do último; `endedTurnOf` é de quem as condições contam agora (sem ninguém na vez, começa o primeiro e nenhum turno acaba). `retreatTurn` volta um (atravessando a rodada; o primeiro da rodada 1 fica) e não devolve condição expirada (§12). `nextAfterRemoval(ordemAntes, id, estado)`: quem sai na vez passa ao seguinte (o último na vez abre a rodada seguinte); sem ninguém, `currentId: null`.
- `tickAtTurnEnd(condições)` → `{ kept, expired }`: cada uma desce uma rodada no **fim do turno de quem a tem**; a da última rodada expira ("Atordoado 1" tira exatamente o próximo turno); `null` dura até ser removida.

## Armadilhas

- Ordem e turno trabalham com combatentes (com `id`): não são VO. O driver acusa `vo-com-identidade` num `.vo.ts` com `id`; o VO é só o valor (`initiative.vo.ts`).
