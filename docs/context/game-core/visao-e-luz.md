# Game-core — visão e luz

Índice: [`game-core.md`](../game-core.md). Plano de origem da luz: [`2026-10-18-iluminacao.md`](../../plans/2026-10-18-iluminacao.md).

## Visão

- `sightArea(olho, paredes, cena, raio)` → o polígono (`Vector2[]`, em ordem de ângulo) que o olho vê: raios param na parede mais perto que bloqueia visão ou na borda da cena; depois no `raio` (`Infinity` = até a borda). Raios em cada vértice de parede e da cena (e a ±1e-5 rad dele, para ver atrás da quina), nos cruzamentos entre paredes, onde a parede sai do círculo e em `SIGHT_ARC_SAMPLES` (64) amostras do arco (uma a cada 5,625°; a corda fica a ≤ 0,12% do raio para dentro). Só entram as paredes da caixa do raio. É o "Sight & Light" (ncase) / Red Blob Games; O(raios × segmentos), com o teto de segmentos por cena do contracts. Todo vértice é cortado à cena.
- `insidePolygon(ponto, polígono)` (par-ímpar) e `lineOfSight(de, até, paredes)` (nenhuma parede que bloqueia visão encontra o trecho pelo `legTouchesSegment`: o olho sobre a linha vê os dois lados; o alvo sobre a linha está atrás dela).
- `sightRange(plena, penumbra)` — cada lado de 0 a `SIGHT_RANGE_MAX` (100) casas, finito; senão `RangeError` "Sight bright 101 … 0 to 100 cells". A penumbra é **a mais**, além da plena (o raio de fora é `bright + dim`).
- `SightMode` = `off | dark | daylight`. `eyeOf(centro, alcance)` → `Eye { center, range }`: **todo token é olho**. O `range` é a **visão no escuro** ("Enxerga no escuro"); sem ela (`null`), o olho no escuro vê só o que está iluminado, e na Luz do dia vê tudo na linha de visão. `SightContext` = `{ eyes, walls, mode, lights }` (`lights: LightSource[]`, as acesas).
- `sightLevel({ eyes, walls, mode, lights }, { box, scenery })` → `seen | silhouette | hidden`. Pontos de teste: o centro da pegada e os quatro cantos **recuados 10%**. Em cada ponto, o nível é **o melhor entre o alcance do olho e a luz no ponto** (`lightLevelAt`, calculado uma vez por ponto, só no `dark`), e depois vale a **linha de visão do olho** até o ponto: sem ela, `hidden`. A área iluminada é vista **a qualquer distância**. `seen` na plena; `silhouette` na penumbra; senão `hidden`. Cenário (`scenery`, o token de Fundo) é `seen` onde seria silhueta. `daylight`: sem limite de distância, só a linha de visão (a penumbra e a luz não contam). `off`: sempre `seen`. Sem olhos, ou sem luz e sem alcance no escuro: `hidden`. Quem decide que o token do próprio viewer é sempre visto é quem chama (o client).
- `doorSeenBy(contexto, porta)` — algum olho vê (plena ou penumbra, pelo alcance próprio **ou pela luz**) um dos pontos a 10%, 50% e 90% da porta, com as outras paredes no caminho; a porta não esconde a si mesma, nem do olho nem da luz (a tocha do outro lado ilumina a porta fechada). `off` → sempre. É a única regra de visão que o server calcula (para o jogador abrir porta).

### Visão com luz

| Ponto do alvo       | Alcance do olho (visão no escuro) | Luz no ponto | Linha de visão do olho | Nível                                   |
| ------------------- | --------------------------------- | ------------ | ---------------------- | --------------------------------------- |
| na plena do olho    | plena                             | —            | sim                    | `seen`                                  |
| fora do alcance     | —                                 | plena        | sim                    | `seen`                                  |
| fora do alcance     | —                                 | penumbra     | sim                    | `silhouette` (o token de Fundo: `seen`) |
| na penumbra do olho | penumbra                          | plena        | sim                    | `seen` (o melhor dos dois)              |
| qualquer            | qualquer                          | qualquer     | **não**                | `hidden`                                |
| fora do alcance     | —                                 | escuro       | —                      | `hidden`                                |

## Luz

- `reach.ts`: `REACH_MAX` (100) e `assertReach(sujeito, lado, valor)`, a validação de plena e penumbra (número finito de 0 a 100 casas) que a visão e a luz dividem. A mensagem cita o sujeito: "Sight bright 101 is invalid: expected 0 to 100 cells." e "Light bright 101 …". Existe à parte para o `token-sight.ts` e o `light.vo.ts` não se importarem em ciclo.
- `LightRange` `{ bright, dim }` — o alcance da luz em casas; como na visão, a penumbra é **a mais** (o raio de fora é `bright + dim`). `lightRange(plena, penumbra)` devolve congelado; `LIGHT_RANGE_MAX` = 100. Plena 0 vale (a vela fraca, só penumbra).
- `SceneLight` `{ x, y, range, lit }` — a luz do mapa (a tocha na parede): um ponto em casas fracionárias. `sceneLight(...)` confere `x`/`y` (finito ≥ 0, senão "Light x -1 is invalid: expected a finite number ≥ 0.") e devolve congelado.
- `lightFits(cena, luz)` — o ponto está em `[0, largura] × [0, altura]` (a borda conta, em centésimos; é o `boxFits` de um `drawingBox(x, y, 0, 0)`). Fica fora do `sceneLight` porque a cena pode encolher.
- `lighting.ts`: `LightSource` `{ center, range }` — uma luz que está brilhando. `lightSource(centro, alcance, acesa)` → `null` sem alcance ou apagada (o token sem luz, a tocha apagada).
- `lightLevelAt(ponto, luzes, paredes)` → `SightLevel`: `seen` a ≤ `bright` de uma luz, `silhouette` a ≤ `bright + dim`, `hidden` no escuro (folga de 1e-9: o ponto exatamente na borda está dentro). Só conta a luz com **linha de visão** até o ponto (`lineOfSight`): as paredes que cortam a luz são as do `blocksSight` (parede, cortina e porta fechada cortam; grade e porta aberta deixam passar). **A melhor luz vale.** Sem luz → `hidden`.
