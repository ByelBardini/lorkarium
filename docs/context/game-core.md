# Game-core

Regra de jogo pura, calculada igual no server e no client. Vive em `packages/game-core/src/`, exportada por `@lorkarium/game-core` (`src/index.ts` reexporta tudo). Sem nenhuma dependência de runtime (nada de React, PixiJS, Fastify, Socket.IO ou `node:`). Specs em `packages/game-core/test/`, unit puro.

## Estrutura

- `src/cell.vo.ts` — a célula do grid (VO)
- `src/grid.ts` — distância entre células e pegada do token na cena
- `src/token-size.vo.ts` — largura e altura do token (VO)
- `src/token-resize.ts` — a caixa do token (e de qualquer caixa com limites próprios) depois de arrastar uma alça
- `src/drawing-box.vo.ts` — a caixa do desenho em casas fracionárias (VO)
- `src/bar.ts` — ajuste de barra (PV e qualquer outra)
- `src/initiative.vo.ts` — o valor da iniciativa (VO)
- `src/initiative-order.ts` — a ordem de turno e o empate
- `src/turn.ts` — avançar e voltar turno, sair do combate, duração de condição
- `src/facing.vo.ts` — a direção do token (VO)
- `src/facing.ts` — ângulo até um ponto, encaixe, giro e vetor da direção
- `src/effect-area.vo.ts` — a área de efeito (gabarito de magia) por forma (VO) e a origem na cena
- `src/effect-area-cells.ts` — as casas que a área pinta, o ponto dentro da forma e a caixa dela
- `src/effect-area-shaping.ts` — o raio até o ponteiro, o giro e o deslocamento da área

## Célula e grid

- `Cell` `{ col, row }` — a posição de um token a partir do canto superior esquerdo, **de meia em meia casa** e ≥ 0 (um token de 0,5 fica em 1,5). `cell(col, row)` devolve o valor congelado e lança `RangeError` citando o eixo e o valor recebido quando não é "multiple of 0.5 ≥ 0" (1,25, −0,5, NaN). `sameCell(a, b)` compara pelo valor.
- `SceneSize` `{ widthCells, heightCells }` — tamanho da cena em casas.
- `cellDistance(a, b)` — distância em casas com a diagonal valendo 1 (Chebyshev): `(0,0)` → `(3,2)` = 3. É a régua do §3.2; outras regras de diagonal são do §12.
- `pathDistance(caminho)` — soma das pernas pelo `cellDistance` (a régua com curvas do arraste): `(0,0)` → `(3,0)` → `(3,4)` = 7; um ponto ou nenhum = 0.
- `footprintFits(scene, origin, size)` — o token é um retângulo `size.width × size.height` ancorado no canto superior esquerdo (`origin`); cabe se `col + width ≤ widthCells` e `row + height ≤ heightCells`, cada eixo por si. Encostar na borda cabe (18,5 + 1,5 = 20). Sem colisão entre tokens (colisão é do §12).
- `TokenSize` `{ width, height }` — `tokenSize(w, h)` aceita múltiplos de 0,5 de `TOKEN_SIZE_MIN` (0,5) a `TOKEN_SIZE_MAX` (10); fora disso, `RangeError` citando o lado e o valor ("width 0.25 … multiple of 0.5 from 0.5 to 10"). O contracts repete os limites no `tokenSideLengthDto` (só depende do `zod`).

## Redimensionar

- `TokenBox` `{ col, row, width, height }`, `ResizeHandle` (`n`, `s`, `e`, `w`, `ne`, `nw`, `se`, `sw`) e `resizeTokenBox(scene, box, alça, { x, y })` (o deslocamento em casas). **Lateral** estica só o seu eixo; **canto** escala os dois mantendo a proporção (`escala = 1 + crescimento / (largura + altura)`, onde o crescimento soma o deslocamento no sentido de cada eixo puxado). A alça oeste/norte move a origem e o lado oposto fica parado. Cada lado vai ao múltiplo do `step` mais perto (`RESIZE_STEP` = 0,5 por padrão; `step` 0 = livre, a prévia que segue o ponteiro) e fica entre 0,5, 10 e a borda da cena para onde é puxado; o canto limita a escala para nenhum lado sair disso (um 2×1 encolhendo para em 1 × 0,5). O client usa na prévia da alça; o server só confere o resultado pelo `footprintFits`.
- `resizeBox(scene, caixa, alça, delta, { step, min, max })` é a mesma conta com o passo e os limites por parâmetro (`ResizeLimits`); o `resizeTokenBox` chama com `{ step, min: 0,5, max: 10 }` e o Quadrado da área de efeito com `{ step: 1, min: 1, max: 100 }` (o lado puxado para na borda da cena, em casas inteiras).

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

## Área de efeito

O gabarito visual de uma magia (sem automação, §12). Origem e tamanhos em casas fracionárias; a cor é uma `string` (a paleta é do DTO, o game-core não importa o contracts).

| Forma (`kind`)                        | Origem `(x, y)`                                                                            | Tamanho                               | Direção (`facing`) |
| ------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------ |
| `square`                              | canto de cima à esquerda, num cruzamento (inteiros)                                        | `width`, `height` inteiros de 1 a 100 | —                  |
| `circle`                              | centro, num cruzamento                                                                     | `reach` inteiro de 1 a 100            | —                  |
| `semicircle`                          | cruzamento                                                                                 | `reach`                               | 0, 90, 180, 270    |
| `orthogonal_cone` (Cone horizontal)   | meio do lado da casa de onde sai (0/180: x inteiro e y em ,5; 90/270: x em ,5 e y inteiro) | `reach`                               | 0, 90, 180, 270    |
| `diagonal_cone`                       | canto da casa de onde sai (cruzamento)                                                     | `reach`                               | 45, 135, 225, 315  |
| `line`                                | centro da casa de onde sai (x e y em ,5)                                                   | `reach`                               | 0 a 359            |
| `emanation`                           | a pegada do token: `x, y, width, height` em meias casas, lados 0,5–10                      | `reach`                               | —                  |
| `smooth_circle` / `smooth_semicircle` | livre, ao centésimo                                                                        | `reach` de 0,5 a 100, ao centésimo    | — / 0 a 359        |

- `effectArea(forma)` confere pela forma (direção antes da origem, depois raio e lados) e devolve congelado; erro é `RangeError` citando a forma, o valor e o esperado ("circle origin (2.5, 3) … grid intersection", "diagonal_cone facing 90 … 45, 135, 225 or 315", "reach 0 … whole cells from 1 to 100", "smooth_circle reach 0.3 … 0.5 to 100"). `EFFECT_AREA_REACH_MAX` = 100 (o `SCENE_CELLS_MAX`), `SMOOTH_REACH_MIN` = 0,5, `isSmoothArea`. Tipos: `SquareArea`, `RoundArea`, `AimedArea` (`AimedAreaKind`), `EmanationArea`.
- `effectAreaOriginFits(cena, área)`: só a **origem** precisa estar em `[0, largura] × [0, altura]` (a borda conta, em centésimos); o resto é cortado, então uma emanação de token encostado na borda vale.
- `effectAreaCells(cena, área)` — **regra do centro**: pinta a casa cujo centro cai dentro da forma, com `≤` e folga de 1e-9 (**a borda conta**: a emanação de um token em meia casa empata e a casa entra). Percorre só a caixa da forma cortada pela cena, em **ordem de leitura** (linha, depois coluna). Cone = raio + até 45° da direção (90° de abertura); semicírculo = raio + do lado da direção; linha = até 0,5 do eixo e avanço em (0, `reach`] (a casa de onde sai fica de fora); quadrado = centro dentro da caixa; emanação = distância até a pegada ≤ `reach` (a pegada inclusa). Forma perfeita → `[]`.
- `effectAreaContains(área, ponto)` (o mesmo teste, serve ao hit-test do perfeito), `effectAreaBounds(área)` (a **menor** caixa da forma antes do corte, onde a seleção e as alças são desenhadas: nas formas de casa, a caixa das casas pintadas — o cone é só a cunha, não o círculo do raio; no círculo perfeito, o círculo; no semicírculo perfeito, só a metade; quadrado e emanação, a própria caixa / a pegada crescida do raio). Para percorrer casas, o `effectAreaCells` usa a caixa do raio inteiro (`reachBoxOf`, interna) e `distanceFromAreaOrigin(área, ponto)` (da origem, ou da borda da pegada na emanação).
- `reachToward(área, ponto, passo)` — o raio que leva a borda ao ponteiro: forma de casa sempre em casas inteiras (mínimo 1), perfeita ao centésimo (`passo` 0) ou ao passo (0,5 com Shift, mínimo 0,5); teto 100.
- `turnEffectArea(área, graus)` — cone horizontal e semicírculo de casa encaixam em 90°, o diagonal em 45 + 90k; os **cones giram em torno do centro da casa de onde saem** (o cone (5; 5,5) → 90 vira (4,5; 6)); semicírculo de casa mantém a origem; linha e semicírculo perfeito giram livres; sem direção, a mesma área.
- `shiftEffectArea(área, dx, dy)` — forma de casa anda casas inteiras (a origem continua onde a forma nasce), a perfeita anda o delta ao centésimo; sair antes de (0, 0) lança o `RangeError` do `effectArea`.

## Armadilhas

- Ordem e turno trabalham com combatentes (com `id`): não são VO. O driver acusa `vo-com-identidade` num `.vo.ts` com `id`; o VO é só o valor (`initiative.vo.ts`).
- A distância das áreas de efeito é **euclidiana** (do centro da casa até a forma) e **não** é a da régua (`cellDistance`, diagonal valendo 1). Não troque uma pela outra; unificar a regra de diagonal é do §12.
- Na união `EffectArea`, `RoundArea` tem `kind` união (`'circle' | 'smooth_circle'`): comparar o `kind` não estreita para fora dela. Estreite por `'facing' in area` (é o que separa `AimedArea`).
