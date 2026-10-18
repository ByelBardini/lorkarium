# Game-core

Regra de jogo pura, calculada igual no server e no client. Vive em `packages/game-core/src/`, exportada por `@lorkarium/game-core` (`src/index.ts` reexporta tudo). Sem nenhuma dependência de runtime (nada de React, PixiJS, Fastify, Socket.IO ou `node:`). Specs em `packages/game-core/test/`, unit puro.

## Estrutura

- `src/cell.vo.ts` — a célula do grid (VO)
- `src/grid.ts` — distância entre células e pegada do token na cena
- `src/drawing-box.vo.ts` — a caixa do desenho em casas fracionárias (VO)
- `src/bar.ts` — ajuste de barra (PV e qualquer outra)
- `src/initiative.vo.ts` — o valor da iniciativa (VO)
- `src/initiative-order.ts` — a ordem de turno e o empate
- `src/turn.ts` — avançar e voltar turno, sair do combate, duração de condição
- `src/facing.vo.ts` — a direção do token (VO)
- `src/facing.ts` — ângulo até um ponto, encaixe, giro e vetor da direção

## Célula e grid

- `Cell` `{ col, row }` — coluna e linha a partir do canto superior esquerdo, inteiros ≥ 0. `cell(col, row)` devolve o valor congelado e lança `RangeError` citando o eixo e o valor recebido quando não é "inteiro ≥ 0". `sameCell(a, b)` compara pelo valor.
- `SceneSize` `{ widthCells, heightCells }` — tamanho da cena em casas.
- `cellDistance(a, b)` — distância em casas com a diagonal valendo 1 (Chebyshev): `(0,0)` → `(3,2)` = 3. É a régua do §3.2; outras regras de diagonal são do §12.
- `pathDistance(caminho)` — soma das pernas pelo `cellDistance` (a régua com curvas do arraste): `(0,0)` → `(3,0)` → `(3,4)` = 7; um ponto ou nenhum = 0.
- `footprintFits(scene, origin, size)` — o token é um quadrado de `size` casas ancorado no canto superior esquerdo (`origin`); cabe se `origin + size ≤` largura/altura. Encostar na última coluna cabe. `size` que não é inteiro ≥ 1 lança `RangeError`. Sem colisão entre tokens (colisão é do §12).

## Desenho

- `DrawingBox` `{ x, y, width, height }` — a caixa de um desenho em **casas fracionárias** (x = 3,5 é o meio da quarta coluna), nunca em pixels: zoom e tamanho de pixel do renderer não movem desenho. `drawingBox(x, y, w, h)` devolve o valor congelado e lança `RangeError` citando o eixo e o valor quando não é "número finito ≥ 0" (NaN e Infinity também). Largura ou altura 0 vale (linha reta da mão livre).
- `boxFits(scene, box)` — cabe se `x + width ≤ widthCells` e `y + height ≤ heightCells`; encostar na borda cabe. A comparação é em centésimos (o desenho é guardado a 0,01), então `19,9 + 0,1` não estoura 20. É a regra que o client (corte antes do comando) e o server (`OUT_OF_SCENE`) dividem.
- `translateBox(box, dx, dy)` — a caixa nova deslocada; a original fica intacta; sair antes da origem lança o `RangeError` do `drawingBox`.

## Barra

- `BarChange` = `{ op: 'add', amount }` ("−7", "+5") | `{ op: 'set', value }` ("12"). `applyBarChange(atual, mudança, limite)` devolve o valor novo: **livre** (negativo e acima do máximo valem, nada automático no zero, spec §2.1), só travado em ±`limite`. O limite vem por parâmetro (`BAR_VALUE_LIMIT` do contracts), porque o game-core não importa o contracts. Valor não inteiro lança `RangeError` citando o valor.

## Combate

- `initiative(valor)` — inteiro de −999 a 999 (`INITIATIVE_LIMIT`) ou `null` (ainda não rolou); fora disso, `RangeError` citando o valor e "−999…999".
- `orderCombatants(lista)` — do maior para o menor, sem iniciativa no fim, empate pela `tieOrder` (a ordem de entrada); `moveWithinTie(lista, id, 'up' | 'down')` troca a `tieOrder` com o vizinho **só** se tiver a mesma iniciativa (o ↑/↓ do mestre). `OrderEntry` = `{ id, initiative, tieOrder }`.
- `TurnState` `{ round, currentId }` — a vez segue o combatente, não a posição: mudar a iniciativa no meio da rodada não muda quem joga.
- `advanceTurn(ordem, estado)` → o próximo, e o primeiro com `round + 1` depois do último; `endedTurnOf` é de quem as condições contam agora (sem ninguém na vez, começa o primeiro e nenhum turno acaba). `retreatTurn` volta um (atravessando a rodada; o primeiro da rodada 1 fica) e não devolve condição expirada (§12). `nextAfterRemoval(ordemAntes, id, estado)`: quem sai na vez passa ao seguinte (o último na vez abre a rodada seguinte); sem ninguém, `currentId: null`.
- `tickAtTurnEnd(condições, rodada)` → `{ kept, expired }`: cada uma desce uma rodada no **fim do turno de quem a tem**; a da última rodada expira; `null` dura até ser removida. A aplicada **nesta mesma rodada** (`appliedRound === rodada`) não conta ainda: "Caído 1" aplicada na rodada 1 sai no fim do turno de quem a tem na rodada 2 (dura uma rodada inteira). `appliedRound: null` (aplicada fora de combate) conta desde o primeiro turno.

## Direção

- `Facing` — para onde o token olha, em graus inteiros de 0 a 359: **0 = olhando para baixo** (a convenção do Foundry, que a arte top-down de VTT segue), crescendo no sentido **horário da tela** (90 = esquerda, 180 = cima, 270 = direita). Com o eixo y para baixo, a rotação positiva do PixiJS aplicada à imagem bate com o número. `facing(valor)` lança `RangeError` citando o valor e "whole number from 0 to 359" (360, −1, 12,5 e NaN).
- `normalizeFacing(graus)` — arredonda e dá a volta: −90 → 270, 359,6 → 0 (nunca 360).
- `facingToward(de, para)` — a direção que olha de um ponto a outro (coordenadas de tela); o mesmo ponto → `null` (a alça mantém a atual).
- `snapFacing(graus, passo)` — o múltiplo de `passo` mais perto (o Shift da alça, 45°): 22 → 0, 23 → 45, 350 → 0.
- `turnFacing(atual, delta)` — gira e dá a volta (Q = −45, E = +45): 0 − 45 → 315.
- `facingVector(direção)` — o vetor unitário (`Vector2`) da direção: 0 → `{ x: 0, y: 1 }`, 90 → `{ x: −1, y: 0 }`. É onde ficam a marca e a alça.

## Armadilhas

- Ordem e turno trabalham com combatentes (com `id`): não são VO. O driver acusa `vo-com-identidade` num `.vo.ts` com `id`; o VO é só o valor (`initiative.vo.ts`).
