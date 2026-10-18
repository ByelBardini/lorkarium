# Game-core

Regra de jogo pura, calculada igual no server e no client. Vive em `packages/game-core/src/`, exportada por `@lorkarium/game-core` (`src/index.ts` reexporta tudo). Sem nenhuma dependência de runtime (nada de React, PixiJS, Fastify, Socket.IO ou `node:`). Specs em `packages/game-core/test/`, unit puro.

## Estrutura

- `src/cell.vo.ts` — a célula do grid (VO)
- `src/grid.ts` — distância entre células e pegada do token na cena
- `src/token-size.vo.ts` — largura e altura do token (VO)
- `src/token-resize.ts` — a caixa do token depois de arrastar uma alça
- `src/drawing-box.vo.ts` — a caixa do desenho em casas fracionárias (VO)
- `src/bar.ts` — ajuste de barra (PV e qualquer outra)
- `src/initiative.vo.ts` — o valor da iniciativa (VO)
- `src/initiative-order.ts` — a ordem de turno e o empate
- `src/turn.ts` — avançar e voltar turno, sair do combate, duração de condição
- `src/facing.vo.ts` — a direção do token (VO)
- `src/facing.ts` — ângulo até um ponto, encaixe, giro e vetor da direção

## Célula e grid

- `Cell` `{ col, row }` — a posição de um token a partir do canto superior esquerdo, **de meia em meia casa** e ≥ 0 (um token de 0,5 fica em 1,5). `cell(col, row)` devolve o valor congelado e lança `RangeError` citando o eixo e o valor recebido quando não é "multiple of 0.5 ≥ 0" (1,25, −0,5, NaN). `sameCell(a, b)` compara pelo valor.
- `SceneSize` `{ widthCells, heightCells }` — tamanho da cena em casas.
- `cellDistance(a, b)` — distância em casas com a diagonal valendo 1 (Chebyshev): `(0,0)` → `(3,2)` = 3. É a régua do §3.2; outras regras de diagonal são do §12.
- `pathDistance(caminho)` — soma das pernas pelo `cellDistance` (a régua com curvas do arraste): `(0,0)` → `(3,0)` → `(3,4)` = 7; um ponto ou nenhum = 0.
- `footprintFits(scene, origin, size)` — o token é um retângulo `size.width × size.height` ancorado no canto superior esquerdo (`origin`); cabe se `col + width ≤ widthCells` e `row + height ≤ heightCells`, cada eixo por si. Encostar na borda cabe (18,5 + 1,5 = 20). Sem colisão entre tokens (colisão é do §12).
- `TokenSize` `{ width, height }` — `tokenSize(w, h)` aceita múltiplos de 0,5 de `TOKEN_SIZE_MIN` (0,5) a `TOKEN_SIZE_MAX` (10); fora disso, `RangeError` citando o lado e o valor ("width 0.25 … multiple of 0.5 from 0.5 to 10"). O contracts repete os limites no `tokenSideLengthDto` (só depende do `zod`).

## Redimensionar

- `TokenBox` `{ col, row, width, height }`, `ResizeHandle` (`n`, `s`, `e`, `w`, `ne`, `nw`, `se`, `sw`) e `resizeTokenBox(scene, box, alça, { x, y })` (o deslocamento em casas). **Lateral** estica só o seu eixo; **canto** escala os dois mantendo a proporção (`escala = 1 + crescimento / (largura + altura)`, onde o crescimento soma o deslocamento no sentido de cada eixo puxado). A alça oeste/norte move a origem e o lado oposto fica parado. Cada lado vai ao múltiplo do `step` mais perto (`RESIZE_STEP` = 0,5 por padrão; `step` 0 = livre, a prévia que segue o ponteiro) e fica entre 0,5, 10 e a borda da cena para onde é puxado; o canto limita a escala para nenhum lado sair disso (um 2×1 encolhendo para em 1 × 0,5). O client usa na prévia da alça; o server só confere o resultado pelo `footprintFits`.

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

- `Facing` — para onde o token olha, em graus inteiros de 0 a 359: **0 = olhando para a direita** (a alça e a marca nascem do lado direito, longe do nome sob o token), crescendo no sentido **horário da tela** (90 = baixo, 180 = esquerda, 270 = cima). A imagem no 0 fica como foi desenhada. Com o eixo y para baixo, a rotação positiva do PixiJS aplicada à imagem bate com o número. `facing(valor)` lança `RangeError` citando o valor e "whole number from 0 to 359" (360, −1, 12,5 e NaN).
- `normalizeFacing(graus)` — arredonda e dá a volta: −90 → 270, 359,6 → 0 (nunca 360).
- `facingToward(de, para)` — a direção que olha de um ponto a outro (coordenadas de tela); o mesmo ponto → `null` (a alça mantém a atual).
- `snapFacing(graus, passo)` — o múltiplo de `passo` mais perto (o Shift da alça, 45°): 22 → 0, 23 → 45, 350 → 0.
- `turnFacing(atual, delta)` — gira e dá a volta (Q = −45, E = +45): 0 − 45 → 315.
- `facingVector(direção)` — o vetor unitário (`Vector2`) da direção: 0 → `{ x: 1, y: 0 }`, 90 → `{ x: 0, y: 1 }`. É onde ficam a marca e a alça.

## Armadilhas

- Ordem e turno trabalham com combatentes (com `id`): não são VO. O driver acusa `vo-com-identidade` num `.vo.ts` com `id`; o VO é só o valor (`initiative.vo.ts`).
