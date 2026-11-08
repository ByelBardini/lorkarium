# Client · tokens que bloqueiam a visão

O lado do client do token com `blocksSight`: os contornos carregados por asset e a lista única de paredes de visão. A regra (forma por caso, pose, `ignores`, `blockersIgnoredAt`) mora no game-core ([`../game-core/visao-e-luz.md`](../game-core/visao-e-luz.md), Bloqueador); o traçado e a rota, em [`../assets/contorno.md`](../assets/contorno.md); o campo e o teto, em [`../tokens/bloqueio-de-visao.md`](../tokens/bloqueio-de-visao.md).

O mestre sem prévia não é filtrado, mas o tingimento, as áreas da ferramenta Luzes e o contorno do cone são cortados para ele também: a geometria é uma só, de quem olhar.

## A geometria (`src/lib/sight-geometry.ts`)

`sightGeometryOf(board, outlines, landing?)` → `SightGeometry { walls, blockers }`.

- `board`: `SightGeometryBoard { scene, tokens, walls }` (o `BoardStateDto` serve). `outlines`: `SightOutlines` = `ReadonlyMap<assetId, SightOutline | null>`. `landing`: o `TokenLanding` do `shownCellsOf`, a pose **mostrada**: o bloqueador arrastado ou girado antes do ack bloqueia de onde aparece.
- Entra quem tem `blocksSight` e não está `hidden`, na ordem dos tokens: `blockerTokensOf(tokens)`, uma varredura por array (`WeakMap`, regra 12 de [`performance.md`](performance.md)), que o `poseShapingIdsOf` também usa.
- `walls`: as paredes reais primeiro, mesma ordem e instância de `gameWallsOf(board.walls)`, depois as dos bloqueadores, **as mesmas instâncias** de `blockers[i].walls` (o `ignores` do game-core compara por referência; cópia volta a cortar). O índice do `doorsSeen` e a instância da porta continuam valendo.
- **Sem bloqueador:** `walls` é o próprio `gameWallsOf(board.walls)` e `blockers` é uma lista vazia compartilhada. Mesa que não usa o recurso não muda nenhuma identidade.

### Estabilidade

A **mesma `SightGeometry`** (logo os mesmos `walls` e `blockers`) volta enquanto o array de paredes reais e a chave de forma não mudam. As memórias da visão podem chavear por `geometry.walls` ou `geometry.blockers`.

| Mudança                                                                 | Resultado         |
| ----------------------------------------------------------------------- | ----------------- |
| `tokens` novo com a mesma pose, ou `outlines` novo com o mesmo contorno | a mesma geometria |
| Outro token (não bloqueador) anda ou gira                               | a mesma geometria |
| Chega contorno `null` ou `[]` (mesma forma: o retângulo)                | a mesma geometria |
| Chega contorno em borda `round`, ou de outro asset                      | a mesma geometria |
| Girar token sem imagem (o disco de iniciais não gira)                   | a mesma geometria |
| Bloqueador muda casa, direção, tamanho, inversão, borda ou imagem       | geometria nova    |
| Chega contorno com pontos de um bloqueador `square`                     | geometria nova    |
| Tamanho da cena muda, ou o array de paredes reais muda                  | geometria nova    |

A memória é um `WeakMap` pelo array de paredes reais, com **uma** entrada por array: o grid mostrado e o grid do grupo, lidos em revezamento no mesmo render, não se derrubam. Parede que muda refaz também os `blockers`, mesmo com a forma igual.

A chave leva o **id do asset**, não os vértices: o contorno de um asset nunca muda, e escrever 48 vértices por bloqueador a cada leitura custaria mais que o que poupa.

`blockerAssetIdsOf(tokens)` → os assets que a cena precisa: bloqueadores não `hidden`, borda `square`, com imagem, sem repetir.

## Os contornos

- `services/assets-api.ts` — `AssetOutlineApi { outlineOf(assetId) }` → `AssetOutlineResult`: `{ ok: true, outline }` (validado pelo `assetOutlineResponseDto`; `[]` e `null` chegam como vieram) ou `{ ok: false, failure }` (`AssetsFailure`). `GET /api/assets/:assetId/outline`. O `AssetsApi` (só o envio) fica como era, porque o `DocumentImageAssets` do editor de documentos o implementa; `RoomAssetsApi` = os dois, o tipo de `AppDependencies.assets` e do `PlayRoomPageProps.assets`, implementado pelo `HttpAssetsApi`.
- `stores/sight-outline-store.ts` — `createSightOutlineStore(api)` → `SightOutlineStore { outlines, request(assetIds) }`.
  - **Sem entrada** = ainda não se sabe; `null` = a imagem não tem contorno, ou a busca falhou. As duas bloqueiam pelo retângulo; a diferença importa a quem mostra aviso.
  - Uma busca por asset, na vida da store. Falha fica como `null` até a sala abrir de novo, sem repetir em laço.
  - Os contornos de um `request` chegam juntos: uma mudança de estado, uma geometria nova. `request` só do que já foi pedido mantém o mesmo mapa.
  - `useSightOutlines(store, seletor)` é a vista em React.
- `features/board/table-sight-outlines.ts`:
  - `useRoomSightOutlines(assets, shown, group)` → a store da sala, uma por montagem. Pede os contornos dos bloqueadores do grid mostrado e do grid do grupo (a aba "Na mesa" filtra por ele), na abertura, a cada `tokens` novo e na troca de aba. Montado em `PlayRoomPage`, que guarda a store.
  - `TableSightOutlinesContext` e `useTableSightOutlines()` → o mapa atual (`RoomContexts`, prop `sightOutlines`). Fora da sala, um mapa vazio sempre igual.

### Como um consumidor obtém os contornos

- **Em React, dentro da sala:** `useTableSightOutlines()`, que redesenha quando chega contorno.
- **Fora do React, ou acima do `RoomContexts`** (`use-interaction-follows-table.ts`, que roda no corpo da `PlayRoomPage`): `sightOutlines.getState().outlines`, recebendo a store como parâmetro.
- **Saber de um asset fora dos bloqueadores da cena:** `store.getState().request([assetId])`.

## Como a geometria chega em cada um

| Quem                                                                      | Como lê                                                                                                    |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `useBoardSight` (lista, hover, combate, canvas)                           | `useTableSightOutlines()` → `sightNowOf`                                                                   |
| `use-board-keyboard.ts`, `use-combat-recap.ts`                            | `useTableSightOutlines()` → `sightNowOf`                                                                   |
| `use-interaction-follows-table.ts`, acima do `RoomContexts`               | a store da sala por parâmetro (4º) → `getState().outlines` → `sightNowOf`                                  |
| `sightNowOf` (4º parâmetro, **obrigatório**)                              | `sightGeometryOf(board, outlines, landing)` na chave; passa `outlines` ao `boardSightOf`                   |
| `boardSightOf`, `sightWithMovedOf` (`options.outlines`)                   | `sightGeometryOf`, a mesma instância pela memória; sem `outlines`, `NO_SIGHT_OUTLINES`                     |
| `buildBoardView` (`input.sightOutlines`)                                  | calcula uma vez (`walls` ausente → vazio constante) e passa `geometry` à névoa, tinta, cone, luzes e linha |
| `fogViewOf`, `lightTintViewOf`, `sightConeViewOf`, `lightViewsOf`         | `input.geometry`; ausente, `wallsOnlyGeometryOf(input.walls)`: só as paredes                               |
| `lightAreasOf`                                                            | as `walls` por parâmetro e o `ignores` da própria `LightSource`                                            |
| `blockedPassage`, rota, setas (`board-area.tsx`, `use-board-keyboard.ts`) | `gameWallsOf`: só a parede real, nunca a geometria                                                         |

## O filtro e a luz

- **Olho e luz de token:** `blockerIgnoresOf(bloqueadores, centro, token.id)`, sobre o `blockersIgnoredAt` do game-core (`eyeOfToken(token, landing, blockers)`, `tokenLightOf`). O próprio token e todo bloqueador em que ele está ficam de fora.
- **Luz do mapa e luz velada:** `blockerIgnoresOf(bloqueadores, ponto)`.
- **Alvo que é bloqueador:** `SightTarget.ignores` = só as paredes dele (`ownWallsOf` em `board-sight.ts`): a estátua é vista, e a estátua atrás de outra continua escondida.
- **`blockerIgnoresOf` guarda a lista** por `blockers` + ponto + id (`WeakMap`, teto de 1024 por geometria). Faz duas coisas: quem está em dois bloqueadores ganha uma lista só dele, e sem a memória ela seria nova a cada build, trocando a chave da névoa; e tira 86 pontos × 50 bloqueadores × 48 vértices do caminho da régua. Sem bloqueador, sai sem tocar em nada.
- `lightSourcesOf` e `shiningLightsOf` recebem `blockers` no 3º parâmetro (padrão `NO_BLOCKERS`): sem bloqueador, a fonte nem ganha a chave `ignores`.
- `poseShapingIdsOf` inclui o bloqueador não `hidden`: arrastar e girar refazem o filtro inteiro. O arraste de quem não molda nada continua no `sightWithMovedOf`, que reaproveita os olhos (`eyes` igual por identidade).
- **Memória das áreas:** `rememberedWorldAreaOf(centro, paredes, cena, alcance, campo?, ignores?)` leva o `ignoresIdOf(ignores)` na chave (`wallSetIdOf` da lista; ausente ou vazia = 0). `worldAreaOf` e `lightAreasOf` repassam ao `sightArea`.
- **Chaves das vistas:** névoa (cada olho, cada luz e os níveis dos bloqueadores), tinta (cada luz) e cone levam o `ignoresIdOf`. É o que separa, com as mesmas paredes e o mesmo centro, o olho do bloqueador do olho de quem está no lugar dele.

## A névoa abre o corpo

`FogView.blockerHoles: { bright, dim }`: as ilhas de cada bloqueador, em px de mundo, pelo nível dele no filtro (`levelOf`). O interior está atrás do próprio contorno, e sem o buraco a arte ficaria sob a névoa.

| Nível do bloqueador | `dim` (abre a folha opaca) | `bright` (abre a folha de 55%) | Na tela                   |
| ------------------- | -------------------------- | ------------------------------ | ------------------------- |
| `seen`              | sim                        | sim                            | a estátua inteira         |
| `silhouette`        | sim                        | não                            | a silhueta sob a penumbra |
| `hidden`            | não                        | não                            | nada                      |

- A chave leva os níveis; mover ou chegar contorno já troca o `wallSetIdOf(geometry.walls)`. Régua, seleção e arraste de outro token devolvem a **mesma** `FogView`.
- `pixi-fog-layer.ts`: cada folha preenche os polígonos no `own` das aberturas, fora da máscara das linhas de visão, porque o corpo abre mesmo sem luz por cima dele. O PixiJS fica fora do unit: a prova na tela é o e2e da Fase 11.
- Sem bloqueador, `blockerHoles` vem com as duas listas vazias e nada mais muda.

## O interruptor e o aviso

Na aba "Visão e luz" do diálogo do token, só para o mestre, porque o jogador não vê a aba. O diálogo está em [`token-dialog.md`](token-dialog.md).

- `features/tokens/sight-blocker-section.tsx`, `SightBlockerSection({ on, onSwitch, imageAssetId, frame, refusal })`: o `SwitchedSection` "Bloqueia a visão" (grupo com ícone, título, dica e `Switch`, a mesma moldura da `ReachSection`) e, ligado, o aviso e a recusa.
- O aviso olha a imagem **do formulário** e a borda que o token salvaria (`blockerFrameOf`):

| Caso                                             | Aviso                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Borda redonda, com ou sem imagem                 | "Com borda redonda, bloqueia pelo disco."                                                         |
| Quadrada, contorno `null`                        | "Imagem enviada antes deste recurso: bloqueia pelo retângulo. Envie de novo para usar o recorte." |
| Quadrada, contorno com pontos, ou `[]`           | nenhum                                                                                            |
| Quadrada, sem entrada (carregando) ou sem imagem | nenhum                                                                                            |
| Interruptor desligado                            | nenhum, e nada é pedido                                                                           |

- O contorno vem de `useAssetOutline(assetId)` (`table-sight-outlines.ts`): lê o mapa da sala e dispara `request([assetId])` pelo `TableSightOutlineRequestContext`, que o `RoomContexts` preenche. É preciso porque o `useRoomSightOutlines` só pede imagem de quem **já** bloqueia. Fora da sala, não pede nada e não avisa. A borda redonda não pede: não lê o contorno.
- `null` também é falha de busca, então uma rede ruim mostra o aviso da imagem antiga até a sala abrir de novo. Custo aceito: a store não distingue as duas, e a forma que bloqueia é de fato o retângulo.

## O colar e a recusa do teto

- `copiedOf` leva o `blocksSight` no `NewTokenInput` (`paste-placement.ts`): colar e Duplicar mantêm o valor, e o server zera para o jogador.
- `TOKEN_BLOCKER_LIMIT` → falha `token_blocker_limit` (`board-command-sender.ts`) → "A cena já tem o máximo de 50 tokens que bloqueiam a visão." (`board-messages.ts`, com `TOKEN_SIGHT_BLOCKERS_PER_SCENE_MAX`). No diálogo, a recusa aparece **dentro da seção** e o diálogo salta para a aba; ao colar, sai no aviso de sempre.

## A linha do mestre

- `renderer/sight-blocker-outline-view.ts` (sem DOM): `sightBlockerOutlineViewOf({ viewer, blockers, selectedTokenIds })` → `SightBlockerOutlineView { polygons }` em px de mundo, só para o mestre e com o token selecionado sozinho; `null` para jogador, espectador, dois selecionados, token sem o campo e bloqueador `hidden`, que não está bloqueando. Lê os `blockers` da geometria, então mostra a forma real, na pose mostrada (`landing`): a linha acompanha o arraste e o giro.
- A vista é memorizada pela identidade do `SightBlocker` (`WeakMap`): mesma geometria, mesma vista.
- `sightBlockerOutlineDashesOf(view, zoom)`: traços de 6 px e vãos de 4 px **na tela** (o PixiJS 8 não tem traço pronto). A fase corre em volta do anel: recomeçar em cada vértice fecharia os 32 lados curtos do disco numa linha cheia de longe.
- `renderer/pixi-sight-blocker-layer.ts`: `PixiSightBlockerLayer.draw(view, zoom)` compara a vista por identidade e o zoom. Fica em `PixiBoardOverlays`, logo acima do contorno do cone e abaixo das paredes. Pela regra 5 de [`performance.md`](performance.md), mover a câmera sem zoom não refaz a linha.
- `buildBoardView` entrega `sightBlockerOutline`; o `BoardCanvas` passa `sightOutlines` pelo `useTableSightOutlines()`.

## Testes

- Sem DOM: `test/lib/sight-geometry.spec.ts` (ordem e instância, memória, pose, contorno que chega, `blockerAssetIdsOf`), `test/stores/sight-outline-store.spec.ts` e "outlineOf" em `test/services/assets-api.spec.ts`.
- Hook e sala: `test/features/board/table-sight-outlines.spec.tsx`, inclusive a sala inteira pedindo o contorno pelo `deps.assets.outlines`.
- Interruptor e aviso: `test/features/tokens/sight-blocker-section.spec.tsx`, `vision-light-tab.spec.tsx` e `token-dialog-sight-blocker.spec.tsx` (envio, recusa do teto na aba, jogador, borda da forma); `useAssetOutline` em `table-sight-outlines.spec.tsx`; o colar em `test/lib/paste-placement.spec.ts`.
- Linha: `test/renderer/sight-blocker-outline-view.spec.ts` (quem vê, pose, traços, `buildBoardView`), `pixi-sight-blocker-layer.spec.ts` (o que não redesenha), `pixi-board-overlays.spec.ts` (a ordem) e o caso do `board-canvas.spec.tsx`.
- Filtro e luz: `test/lib/board-sight-blockers.spec.ts` (estátua, olho dentro, tocha, porta, mestre e prévia, `poseShapingIdsOf`, `sightWithMovedOf`, passagem), "lightSourcesOf with blockers" e "blockerIgnoresOf" em `light-sources.spec.ts`, `test/features/board/use-board-sight-blockers.spec.tsx` (arraste, giro, contorno que chega, a mesma instância).
- Quem chama o filtro: `test/features/board/sight-outlines-consumers.spec.tsx` (teclas, resumo da rodada, anúncio da vez, cada um lendo o contorno da sala).
- Vistas: `test/renderer/fog-view-blockers.spec.ts` (o corpo por nível, a chave, a régua), `board-view-blockers.spec.ts` (a geometria repassada, mestre e jogador), e os blocos "with a blocker" de `light-tint-view`, `sight-cone-view`, `light-view`, `light-areas` e `world-area.spec.ts`.
- E2E: `e2e/test/sight-blockers.spec.ts` (ver [`../ci/e2e.md`](../ci/e2e.md)). Bench e orçamento, inclusive o **bloqueador arrastado acima do orçamento**: [`performance.md`](performance.md), Medições.
- `test/support/sight-blocker-fixtures.ts` — a cena: `lookout` (Lyra em (1, 5), visão 10), `statue` em (4, 5), `ogre` em (7, 5), `goblin` fora da reta, `blockerBoard`, os contornos `TOP_STRIP_OUTLINE` (deixa a reta passar) e `RIGHT_STRIP_OUTLINE` (corta a reta, com o centro fora da forma), `tracedOutlines`.
- `test/support/asset-outline-api-fake.ts` — `AssetOutlineApiFake` (`asked`, `answer`, `failFor`, `hold`, `release`; sem resposta definida, `outline: null`). O `AssetsApiFake` expõe um em `.outlines`.

## Armadilhas

- **`walls` nunca por cópia:** filtrar ou recompor `geometry.walls` paga uma preparação nova (`preparedWalls`) por chamada e quebra o `ignores` por referência. Regra 7 de [`performance.md`](performance.md).
- **Passagem fica fora:** `blockedPassage` e a rota do arraste continuam em `gameWallsOf(board.walls)`. O bloqueador é `curtain` e não barraria, mas o array maior refaria o índice à toa.
- **Todo `sightNowOf` passa os contornos** (o 4º parâmetro, obrigatório): quem passasse outros daria um filtro diferente dos demais e derrubaria a memória a cada chamada.
- **Chave com a geometria:** o `sightNowOf` compara a `SightGeometry` por identidade nas partes; sem isso, o contorno que chega depois do primeiro desenho deixa o filtro velho. O mesmo vale para o `ignoresIdOf` nas chaves das vistas. Ver [`performance.md`](performance.md).
- **Lista de `ignores` sempre por `blockerIgnoresOf`:** chamar o `blockersIgnoredAt` direto numa vista dá lista nova a quem está em dois bloqueadores, e a chave da névoa muda a cada build.
- **Sem `walls` no `board`:** quem tem `walls` opcional (`BoardViewInput`) precisa de um vazio **constante**; `?? []` a cada chamada dá array novo e derruba a memória (a chave do `WeakMap` e a de `wallSetIdOf`).
