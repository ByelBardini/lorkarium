# Client · desempenho do tabuleiro

A escala que o tabuleiro aguenta, o orçamento de cada situação, **as regras que seguram esses números** e como medir. Plano de origem: `docs/plans/2026-10-22-desempenho-tabuleiro-e-server.md`. O lado do server (consultas por comando) está em [`../server.md`](../server.md), Desempenho; a preparação das paredes no game-core, em [`../game-core/visao-e-luz.md`](../game-core/visao-e-luz.md).

## Escala-alvo e orçamento

Cena de estresse: 100 × 100 casas no modo `dark`, **300 tokens** (arte, iniciais, barras, condições e 30 auras), **300 paredes** (900 trechos, com portas, grades e cortinas), **40 luzes** e **8 jogadores**.

| Situação na cena de estresse                   | Orçamento                                              |
| ---------------------------------------------- | ------------------------------------------------------ |
| Mudança local (régua, seleção, ferramenta)     | `buildBoardView` ≤ 2 ms                                |
| Arraste remoto de token que não é olho nem luz | `buildBoardView` ≤ 4 ms; névoa e filtro reaproveitados |
| O próprio olho anda uma casa                   | filtro + névoa ≤ 8 ms                                  |
| Rajada de eventos ou texturas no mesmo quadro  | 1 desenho por quadro                                   |
| Pan sem mudar o zoom                           | 0 reconstrução de paredes, luzes, régua e alças        |
| 1 token muda                                   | 1 token redesenhado                                    |
| Quadro no painel, PC médio                     | p95 ≤ 16,7 ms (60 FPS)                                 |

## Regras de desempenho (não desfazer)

Cada regra diz o que custa quebrá-la, medido na cena de estresse. Mexeu em renderer, visão, névoa, luz ou na regra de visão/passagem do game-core: rode `pnpm bench` antes e depois e compare com "Medições".

1. **Paredes sempre por `gameWallsOf(board.walls)`** (`src/lib/wall-geometry.ts`, `WeakMap` por array), nunca `walls.map(gameWallOf)` num caminho quente. Toda memória abaixo é chaveada pela **identidade** do array de `Wall` (`wallSetIdOf`, `preparedWalls`): um array novo a cada build faz cada olho e cada luz voltarem ao `sightArea` (a régua sozinha custava ~80 ms).
2. **O `board-reducer` só troca o array que o evento toca** (`tokens`, `walls`, `lights`…; o resto do `board` mantém a referência). Reducer novo que recria um array sem mudar nada derruba o filtro, a névoa e a tinta de uma vez.
3. **Todo consumidor da visão passa pelo `useBoardSight`/`sightNowOf`** (`features/board/use-board-sight.ts`): a memória é chaveada pelas partes que o filtro lê (`scene.vision`, viewer, `tokens`/`walls`/`lights` por identidade, prévia e, só para o espectador, os ids dos jogadores **pelo conteúdo** — o array do roster é novo a cada ausência, e a chave por identidade refaria o filtro a cada `memberActivity`) e pela pose de quem molda a visão (`poseShapingIdsOf`: olhos e tokens com luz acesa). O arraste de qualquer outro token só refaz o nível dele (`sightWithMovedOf`). Chamar `boardSightOf` direto refaz 300 tokens × olhos × luzes a cada casa (o arraste remoto custava ~310 ms).
4. **Névoa, tinta e cone calculam a chave antes da geometria** (`fog-view.ts`, `light-tint-view.ts`, `sight-cone-view.ts`): olhos e fontes posicionados (barato), chave com as paredes por `wallSetIdOf`, mesma chave → a última vista inteira. **A chave precisa conter tudo o que a geometria lê**: entrada nova na geometria que não entra na chave = névoa velha na tela. As áreas de olho e de luz moram numa memória só (`rememberedWorldAreaOf`, 256 entradas).
5. **O renderer desenha uma vez por quadro** (`FrameWork` + `flush` no `ticker`, em `pixi-board-renderer.ts`): `draw(view)`, textura nova e câmera só **marcam**. Desenho síncrono num handler volta a desenhar a vista inteira a cada evento de uma rajada. Pan sem zoom só move o container do mundo; o que depende só do zoom (paredes, luzes, régua, cone, alças) fica no `overlays`, e a grade só redesenha quando a vista sai da faixa (`gridBandFor`).
6. **Token redesenha só a parte que mudou** (`tokenRedrawOf`, `token-redraw.ts`; `PixiTokenLayer.place`): campo novo no `TokenView` que o `drawToken`/`drawDefeated`/a placa lê **precisa entrar na comparação**, senão o token não redesenha quando ele muda. A aura tem a parte própria (`aura`, pela `auraKeyOf`, que deixa a posição de fora): casa nova não redesenha a aura, e mudar a aura de 1 entre 300 redesenha só aquela aura e nenhum corpo. Hover só desenha as duas placas; textura que chega só os tokens daquela url (`refreshArt`); o `animate` percorre só o `Set` de quem desliza — animação nova entra nesse conjunto, nunca num laço sobre todos os sprites.
7. **Visão e passagem do game-core sobre paredes preparadas** (`preparedWalls`, `wall-index.ts`): `lineOfSight`, `lightLevelAt`, `sightArea`, `doorSeenBy` e `blockedPassage` usam o índice por baldes e os cruzamentos prontos. Função nova de visão ou passagem usa o mesmo índice; `wallSegments(parede)` dentro de laço por chamada (o jeito antigo) multiplica o custo por 200 (`lineOfSight` 0,08 → 0,0004 ms). Para deixar uma parede de fora (a porta olhada), o `exceto` por referência, nunca um array filtrado (array novo = preparação nova).
8. **Luz: distância antes do cone** (`levelFrom` em `lighting.ts`): quase toda luz da cena está longe de um ponto, e o cone custa mais; inverter a ordem põe o filtro de volta acima do orçamento.
9. **Imagem de condição sem máscara: textura quadrada do server + `fill({ texture, textureSpace: 'local' })`** (`pixi-condition-marks.ts`): o server guarda a imagem `condition` já quadrada (256), e o círculo preenchido por ela é o recorte redondo. Uma máscara por badge quebraria o lote da GPU em cada token com condição (a arte do token ainda paga isso, ver Armadilhas). A textura só é pedida com o badge grande o bastante (bandas `icons`/`detailed`), e a chegada redesenha só as faixas daquela url (`refreshArt`), nunca o corpo.
10. **Aura anima pelo animador, a 30 qps, só na tela; nada redesenha o token** (`PixiAuraAnimator`, `pixi-aura-animator.ts`): o `ticker` passa só pelo conjunto de auras animadas (`PixiAuraFloors.animated()`), um passo a cada `AURA_FRAME_MS` (33 ms), e só as que cruzam o `visibleWorldRect`; o passo troca o quadro do GIF (ou o `uTime` do shader) e nunca chama `draw`/`tokenRedrawOf`. Nenhuma aura animada na tela (ou "Animar auras" desligado, ou movimento reduzido) = nenhum render a mais. Animação nova da aura entra no `tick(segundos)` da `PixiTokenAura`, nunca num laço por token nem num `Ticker.shared` próprio (o `GifSprite` tocaria fora do teto).
11. **Dados 3D: sobreposição ociosa não desenha; 3D desligado não carrega o three** (`three-dice-renderer.ts`, `use-dice-overlay.ts`, ver [`dice.md`](dice.md)): o laço de quadros só existe com rolagem viva e para sozinho depois do fade (canvas `display: none`); o three.js é um chunk próprio buscado só na primeira rolagem com "Dados 3D" ligado. Nada da sala parada passa pelo canvas dos dados: listener de `resize`, `ticker` compartilhado com o Pixi ou `import` estático de `three` fora de `src/dice-renderer/three-dice-*.ts` quebram isso.

## Armadilhas

- **Pixi renderiza todo quadro por padrão** (o `TickerPlugin` põe `app.render` no `ticker`): no runner do CI o WebGL é por software, e um render da tela inteira a 60 fps em 3 páginas ocupava a thread principal — o clique do Playwright não terminava e o tabuleiro não aparecia em 5 s. O renderer tira esse render (`app.ticker.remove(app.render, app)`) e só renderiza quando o `FrameWork.renderDue()` diz (vista, câmera, evento de DOM pelo `on`/`touching`, textura) ou quando o `animate` deu um passo (tokens que deslizam, ou ping vivo no `PixiPingLayer.animate`, que sem ping não toca em nada — ver [`pings.md`](pings.md) —, ou aura animada na tela pelo `PixiAuraAnimator`, regra 10). O balão da fala (`PixiSpeechLayer.animate`) só pede render quando uma bolha entra, sai ou muda de lugar — sem balão, ou bolha parada com câmera parada, não pede. Mudança nova no grafo de cena fora desses caminhos precisa marcar `sceneTouched()`, senão a tela fica velha. Medido com CPU 6× e build de produção: combat.spec:84 falhava (5 s no `toBeVisible`) → passa em 53 s; board.spec 33,6 s (estourava 30 s) → 25,3 s; long tasks do combat 4× em dev: 108 s → 12,5 s somadas.
- **Teste de memória precisa do mesmo array** nos dois lados (`toBe` sobre vista, área ou preparação); array vazio vale sempre o mesmo (`wallSetIdOf([]) === 0`).
- **Bench mede mais que o navegador**: o module runner do Vitest põe um getter em cada export (custo que o navegador não tem), e com o `suppressExportGetterWarnings` desligado um rastreador conta cada chamada a esses getters e infla o número. Compare sempre bench com bench, nunca com o painel.
- **Painel com o navegador oculto não mede**: sem `requestAnimationFrame` o ticker para e o FPS não vale; abra numa janela visível.
- **Custo de GPU ainda presente**: a arte redonda usa uma máscara de `Graphics` por token e o filtro cinza é um filtro por token (`pixi-token-art.ts`, `pixi-token-look.ts`), e cada um quebra o lote da GPU. Medir no painel (CPU p95 < 10 ms e FPS < 55, GPU confirmada no Performance do Chrome) antes de trocar por textura pré-recortada.

## A cena de estresse

- `client/test/support/stress-board.ts` — `stressBoardOf()`: o `BoardStateDto` da cena como o primeiro jogador a vê (`STRESS_PLAYER_IDS[0]`). Masmorra de 10 × 10 salas de 10 casas; em cada sala 3 tokens e 3 paredes (a norte com um dente — grade numa sala em dez, cortina em outra —, uma porta fechada, aberta ou trancada e a oeste com batente). Um token em 19 é de jogador (16 olhos com visão 6 + 6, dois por jogador), um em 10 leva tocha acesa, um em 3 tem arte, um em 5 uma condição, um em 10 uma aura (30: um terço efeito animado, os oito em rodízio, o resto cor Ouro; raio de 1 a 3 casas). `stressId(tipo, n)` dá uuid determinístico; `stressToken(n)` o token n. Mesma cena a cada chamada (provado em `stress-board.spec.ts`).
- `packages/game-core/test/support/wall-grid.ts` — `stressWallGrid()` e `STRESS_SCENE`: as mesmas 300 paredes como VO do game-core.
- No navegador: `pnpm db:seed-dev`, `pnpm db:seed-stress` (imprime `/campaigns/<id>/table`) e `pnpm dev`; entrar como Bia (mestre) ou Caio (jogador, dois tokens com visão), senha `lorkarium-dev`, e abrir a "Mesa de estresse". O seed repete a forma de propósito (um gera linhas pelos services, o outro DTO), sem arte nem condições.

## Bench (`pnpm bench`)

`vitest bench --run --reporter=verbose` na raiz: cada projeto ganha a variante `(bench)` com os `*.bench.ts` (fora do `pnpm test` e do CI, ver [`../ci.md`](../ci.md)). No Vitest 5 o bench vive dentro de um `test` (`async ({ bench }) => bench.compare(bench('a', fn), …, { time, iterations })`). O `suppressExportGetterWarnings` fica ligado no `client/vite.config.ts` e no `packages/game-core/vitest.config.ts`.

- `client/test/bench/board-view.bench.ts` — o que o canvas faz numa mudança (`sightNowOf` + `buildBoardView`): build frio (tabuleiro clonado, nada reaproveitado por identidade), só a régua mudando, arraste remoto de token que não é olho, a aura de um token mudando (o raio, num `board` cujo só `tokens` é novo, como o reducer), o olho do jogador andando uma casa.
- `packages/game-core/test/bench/sight-area.bench.ts` — `sightArea` com alcance 12 e infinito e `lineOfSight` sobre os 900 trechos.
- `packages/game-core/test/support/naive-sight.ts` — o `sightArea`/`lineOfSight` sem preparação, oráculo do `wall-index.spec.ts` (o preparado tem de dar o mesmo polígono, vértice a vértice). Só specs importam.

Rodar três vezes e anotar a mediana da coluna `mean` (ms). A máquina oscila; o número serve para comparar na mesma máquina.

## Painel em dev (`?perf=1`)

- `src/lib/perf-probe.ts` — `PerfProbe { frame(ms), count(métrica, n?), snapshot(agoraMs) }`; `NO_PERF_PROBE` (não guarda nada, o padrão) e `RecordingPerfProbe(janela = 120 quadros)`: FPS pela média da janela, tempo de quadro p50/p95/máx (posto mais próximo) e, por segundo desde o último `snapshot`, cada métrica (`view.draw`, `token.redraw`, `overlays.draw`, `grid.draw`), zerando a contagem.
- `src/app/perf-panel.tsx` — `PerfPanel({ probe, now?, intervalMs? })`: caixa fixa no canto (`role="status"`, "Desempenho") que relê o probe a cada segundo: "59 FPS", "quadro p50 · p95 · máx ms", "vista · tokens · sobreposições · grade por s".
- `src/main.tsx` — só com `import.meta.env.DEV` **e** `?perf=1` na URL cria o `RecordingPerfProbe`, monta o painel e passa o probe ao `createPixiBoardRenderer(onIntent, probe)`. Em produção o probe nunca é criado e o painel nunca monta.
- O que conta: o `ticker` registra `deltaMS`; cada `drawView` do `flush` (no máximo um por quadro) conta `view.draw`; cada corpo de token redesenhado conta `token.redraw` (tabuleiro parado: 0); a grade redesenhada conta `grid.draw` e as sobreposições `overlays.draw` (W A S D dentro da faixa: 0). O tempo do `buildBoardView` (React) entra no tempo de quadro; a conta isolada fica no bench.

## Medições (`mean` em ms, mediana de 3, mesma máquina)

"Sem memória" é o tabuleiro sem nenhuma das regras acima; "atual", com todas ("olho anda uma casa" atual: uma rodada). O painel (p95 do quadro) ainda não tem número: medir à mão com `?perf=1`.

| Caso                        | Sem memória | Atual  | Orçamento | Regras que seguram |
| --------------------------- | ----------- | ------ | --------- | ------------------ |
| build frio                  | 325         | 41     | —         | 7, 8               |
| só a régua                  | 83          | 0,50   | ≤ 2       | 1, 4               |
| arraste remoto (não olho)   | 313         | 0,53   | ≤ 4       | 1, 2, 3, 4         |
| olho anda uma casa          | 320         | 7,5    | ≤ 8       | 3, 4, 7, 8         |
| `sightArea` alcance 12      | 0,27        | 0,24   | —         | 7                  |
| `sightArea` infinito        | 14,6        | 2,1    | —         | 7                  |
| `lineOfSight` pela masmorra | 0,08        | 0,0004 | —         | 7                  |

Com as 30 auras na cena de estresse (2026-10-25, mediana de 3, outras sessões rodando testes na mesma máquina): só a régua 0,43, arraste remoto 0,45, olho anda uma casa 8,1 (mesma faixa de antes sob carga; sem aura, nas mesmas condições, 6,7 a 8,7), build frio 36,7. "A aura de um token muda" custa 7,6: como todo restyle, o `tokens` novo refaz o filtro de visão (regra 3, chave por identidade); a vista em si só compara a `auraKeyOf` de quem mudou. Antes da cena ter auras: só a régua 0,41 e arraste remoto 0,42.

A imagem de condição (regra 9) fica fora da tabela: a cena de estresse não tem condição com imagem, e o custo na vista é um `assetUrlOf` por condição no `conditionsOf`, dentro da oscilação do bench.

Dados 3D (fase 17, 2026-10-25, uma rodada antes e depois, outras sessões rodando na mesma máquina): antes só a régua 0,68, arraste remoto 0,68, olho anda uma casa 9,8, aura muda 12,1, build frio 49,4; depois 0,37, 0,43, 9,4, 7,3, 36,7. O overlay não entra no caminho do tabuleiro (a diferença é oscilação da máquina, para baixo); a sala parada continua sem quadro dos dados.

No renderer (contado pelo probe, não pelo bench): 1 token mudando entre 300 redesenha 1 (antes, 300 a cada desenho); pan sem zoom redesenha 0 sobreposições (antes, todas a cada tique da roda e a cada quadro de W A S D); uma rajada de eventos no mesmo quadro é 1 desenho.

Chat (retomada em 2026-10-28, uma rodada antes/depois, sob carga de testes): régua 0,80/0,83 ms, arraste remoto 0,63/0,77 ms, olho anda uma casa 12,02/9,48 ms, aura muda 10,68/9,49 ms, build frio 58,77/54,23 ms. Os caminhos locais seguem dentro do orçamento; o olho excede 8 ms nas duas medições sob carga, portanto esta rodada não confirma esse orçamento. O balão não altera `buildBoardView`; sua ociosidade é provada por `pixi-speech-layer.spec.ts`.

Legibilidade do balão (2026-10-28, uma rodada antes/depois sob carga): Hanken 14 semibold substitui a serifa itálica; só o estilo usado ao criar a bolha muda, sem medição de texto por quadro. Régua 0,37/0,66 ms, arraste remoto 0,68/1,05 ms, olho anda uma casa 10,03/10,43 ms, aura muda 13,03/10,44 ms, build frio 39,99/51,09 ms. Os caminhos locais seguem no orçamento; o olho já excedia 8 ms antes. Estes benches não medem rasterização da fonte; os specs conferem zero leitura do relógio e zero construção sem balão, e nenhuma reconstrução/render extra com bolha e câmera paradas.
