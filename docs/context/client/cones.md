# Client · cone de visão e luz em cone

O lado do client do cone: o estado e os comandos, o filtro e a névoa em cone, os campos de abertura do diálogo do token e do painel de Luzes, a alça que mira o holofote e o contorno do campo para o mestre. A regra (abertura, cone, campo com anel, polígono, nível de visão, luz em cone) mora no game-core ([`../game-core/visao-e-luz.md`](../game-core/visao-e-luz.md), "Cone e campo"); o contrato em [`../contracts/tabuleiro.md`](../contracts/tabuleiro.md); o server em [`../tokens.md`](../tokens.md) e [`../lights.md`](../lights.md). O filtro e a névoa sem cone em [`vision.md`](vision.md); as luzes em [`lights.md`](lights.md). Plano de origem: [`2026-10-20-cone-de-visao-e-lanterna.md`](../../plans/2026-10-20-cone-de-visao-e-lanterna.md).

> **O client esconde, o server manda tudo**, a mesma linha da visão: o cone só muda o que o client mostra. A exceção é a porta vista, que o server já calcula com o cone.

## Estado e comandos

- O `TokenDto` traz `sightAngle` (o campo de visão, 1–360; 360 = em volta) e a `light.angle` (a abertura do feixe); o `LightDto` traz `facing` e `angle`. O `token:updated` troca o token inteiro (o `sightAngle` vem junto).
- `board-events.ts` valida o `light:conesChanged` pelo `lightConesChangedDto` (`angle: 0` → inválido → resync); `board-reducer.ts` (`withLightCones`) troca **só** o `facing` e o `angle` de cada luz listada.
- `light-commands.ts`: `LightCone` `{ facing, angle }`, `LightConeTarget` (`expect?` = o desfazer) e `setLightCones(mesa, mudanças)` → `light:setConeMany` (sem `expect`, o campo nem vai). O `createLights` manda o `facing` e o `angle` da colocação. O `TableBoardCommands` e o `TableBoardCommandsFake` (grava `setLightCones`) repassam.
- Fixtures: `corridorTorch()`/`brazier()` nascem com `facing: 0, angle: 360`; o `lyra()` e cia. com `sightAngle: 360`; os literais de luz de token dos specs levam `angle: 360`.

## O filtro (quem cada um vê)

- **A pose** (`src/lib/light-sources.ts`): `TokenPose` `{ col, row, facing }` e `TokenLanding` = `ReadonlyMap<id, TokenPose>`. O `shownCellsOf({ dragged, preview, drag, facingPreview, tokens })` (`src/lib/shown-cells.ts`) junta as casas de antes (arraste dos outros → movimento à espera → arraste deste viewer) e o `facingPreview` (a alça e o Q/E antes do ack): o token só girado fica na casa confirmada, o arrastado guarda a direção confirmada; token fora do tabuleiro fica de fora. É a lista do filtro, da névoa, do tingimento e do contorno.
- `board-sight.ts`: o `eyeOfToken(token, landing)` (exportado: a névoa usa o mesmo) monta o olho com o **campo** (`eyeFieldOf` do game-core: a pegada e a direção da pose, o `sightAngle` do token). O cone vale para tudo o que o olho vê; o anel de 1 casa só tira o ângulo (no Escuro ainda pede visão no escuro ou luz). A porta vista (`seenDoorIds`) sai do mesmo `doorSeenBy`.
- `light-sources.ts`: a lanterna do token sai com o `coneOf(pose.facing, light.angle)` e o holofote do mapa com o `coneOf(facing, angle)` dele (360 → `cone: null`).
- `use-board-sight.ts`: o `SightInteraction` inclui o `facingPreview`; o `sightNowOf` monta a pose com ele e os tokens confirmados, e a memória (chave das poses) já leva a direção. Girar a Lyra para trás mostra o ogro de trás **antes** do `token:facedMany`; recusado, ele some de novo (a lista "Na cena", o `]`/`[` e o menu seguem).

## A névoa e as luzes

- `src/renderer/world-area.ts` — `worldAreaOf(centro, paredes, cena, alcance, campo?)`: o `sightArea` do game-core × 64 px (alcance 0 → `[]`). É o único que escala polígono para o canvas: a névoa, as áreas das luzes e o contorno passam por ele.
- `fog-view.ts`: os olhos vêm do `eyeOfToken` (com o campo); a área própria, a plena da Luz do dia e as `sightLines` (a linha de visão que abre o que a luz ilumina) são cortadas ao campo. A `key` leva o `field` de cada olho e o `cone` de cada luz.
- `light-areas.ts`: a luz em cone (`LightSource.cone`) vira o campo `{ cone, around: null }` (sem anel); o cone entra na chave da memória (mirar de novo → outra instância; a mesma direção → a mesma).
- `light-tint-view.ts` leva o cone na `key`; `light-view.ts` (as áreas da ferramenta Luzes) monta a fonte com o `coneOf` da luz.

## O diálogo e a colagem

- `src/lib/cone-form.ts` — `coneFieldOf(abertura)` ("90") e `parseConeField(texto)` → `{ ok, angle }` (vazio = 360) ou `{ ok: false, error }`: "De 1 a 360°." (0, 361) e "Use graus inteiros, de 1 a 360." (12,5, abc). Dividido com o painel de Luzes.
- `src/components/cone-angle-field.tsx` — `ConeAngleField` (rótulo, texto, erro, dica, `placeholder`, `onBlur`): o campo de graus dos dois lugares.
- `token-form-state.ts`: `facing` (só leitura, para a prévia), `sightAngle` e `lightAngle` (texto) nos valores; `errors.sightAngle` / `errors.lightAngle` (a aba "Visão e luz" ganha a marca de erro). O Novo começa com "360" nos dois. O `parseTokenForm` manda `sightAngle` sempre e o `light.angle` só com "Emite luz" (desligado, o feixe nem é conferido).
- `vision-light-tab.tsx`: "Campo de visão (°)" **fora** do "Enxerga no escuro" (o token cego também olha em cone), dica "360 = vê para todo lado; menos, vê em cone para onde o token olha, e sente o que está a 1 casa em volta."; "Abertura do feixe (°)" dentro do "Emite luz", dica "360 = ilumina em volta; menos, ilumina em cone, como uma lanterna." (`SIGHT_ANGLE_HINT`, `LIGHT_ANGLE_HINT` do `token-messages.ts`).
- `token-preview.tsx`: abaixo de 360, o `LightGlow` ganha a máscara em cunha (`mask-image: conic-gradient(from Xdeg, #000 0deg Adeg, transparent Adeg)`, com X = direção − abertura/2 + 90: o gradiente cônico do CSS começa no alto, e a direção 0 olha para a direita).
- A colagem (`paste-placement.ts`, `newTokenOf`) leva o `sightAngle`; a `light` já vai inteira (com o `angle`).

## O painel e o desfazer

- `light-reach-store.ts`: `angle` (padrão 360) e `setAngle`, em `lorkarium.lightReach.angle` (fora de 1–360 inteiro, ou storage que lança → 360). O `placeLight(ponto, alcance, cor, abertura)` e o `sendLight` (`LightToolContext.angle`) põem a luz nova com `facing: 0` e a abertura lembrada; o `light-intents.ts` lê a abertura da loja.
- `src/stores/light-cone-flow.ts` (o cone fora do `light-edit-flow.ts`, que já cuida de mover, alcance, cor e excluir): `changeLightAnglesOf` (o painel com luzes pegas: **um** `setLightCones` com a direção atual de cada luz que muda e o `expect` do cone que tinha; todas já na abertura → nada; recusado → o motivo na linha; `readOnly` → nada), `previewLightAimOf` e `aimLightOf` (a alça, abaixo). Confirmado, `lightConesChanged` na pilha.
- `edit-history.ts`: `LightCone`, `LightConeChange` `{ lightId, from, to }` e a op `lightConesChanged` (inverso troca `from`/`to`; `remapEntry` troca o id; é `isLightOp`). O recriar de `lightsRemoved` leva o `facing`/`angle` da colocação (o `deleteLightsOf` guarda os dois). `light-edit-ops.ts` manda o `setLightCones` com `expect` = o `from`.
- `light-panel.tsx`: "Abertura (°)" (`AngleField` sobre o `ConeAngleField`), no mesmo `commit` do alcance (`change` na próxima luz, `blur` nas pegas); aberturas diferentes → vazio com "vários"; "0" → o erro no campo e nada vai. `room-light-panel.tsx` passa o `commonOf` da abertura e o `changeLightAngles`; sem luz pega, a abertura lembrada.

## Mirar a luz do mapa

- `src/renderer/light-aim-handle.ts` — `lightAimTarget(luz)`: a luz do mapa como `FacingTarget` (a haste sai do ícone, de `LIGHT_ICON_REACH` a `LIGHT_ICON_REACH + HANDLE_GAP` px na direção dela; `facingAt` pelo `facingToward` do ponto, Shift no `FACING_SNAP_STEP` de 45°; o ponteiro sobre o ícone mantém a direção; `previewed` → `lightAimPreviewed`, `turned` → `lightAimed`). `lightAimTargetOf(view)`: só com a ferramenta Luzes, uma luz pega sozinha e abaixo de 360.
- `handle-targets.ts`: o `boardFacingTargetOf` cai na luz depois do token e da área. `press-route.ts`: na ferramenta Luzes, a alça vence o ícone e o tabuleiro vazio (`lightRouteOf`). O `PixiFacingHandle` desenha e arrasta qualquer alvo que o `boardFacingTargetOf` devolve. O `LightView` leva `facing` e `angle`.
- Intents `lightAimPreviewed` / `lightAimed` (`BoardLightIntent`) roteados no `light-intents.ts` para o `previewLightAim` / `aimLight` da `board-interaction-store`, que guarda o `lightAimPreview` (no `NO_PREVIEWS`, no `useLocalBoardView` e limpo pelo `toolChangeOf` ao trocar de ferramenta). Soltar na mesma direção → nada; recusado → a prévia volta e a linha diz o motivo.
- `board-view.ts`: o `BoardViewInput.lightAimPreview` vira a direção das luzes (`aimedLightsOf`) nas áreas da ferramenta e no **tingimento** antes de soltar. Os jogadores veem o cone novo no `light:conesChanged`.

## O contorno do mestre

- `src/renderer/sight-cone-view.ts` — `sightConeViewOf({ viewer, scene, tokens, walls, selectedTokenIds, landing })` → `SightConeView { outline, key }` ou `null`: só o mestre, só numa cena Escuro ou Luz do dia, só um token selecionado e com `sightAngle` < 360. O `outline` é o `worldAreaOf` com o campo (cone + anel) na pose do `landing` (segue a alça e o arraste), cortado pelas paredes, até o **alcance da visão**: no Escuro, a visão no escuro do token (`bright + dim`); na Luz do dia, ou para o token sem visão no escuro (que vê o que está iluminado a qualquer distância), até a borda da cena. O alcance entra na `key`. `BoardView.sightCone`.
- `pixi-sight-cone-layer.ts` — `PixiSightConeLayer`: contorno dourado `#c5a46d` a 60% (1,5 px de tela) e preenchimento a 6%; redesenha só quando a `key` ou o zoom mudam. Nas sobreposições, entre as áreas das luzes e as linhas de parede.

## Testes

- Sem DOM: `test/lib/shown-cells.spec.ts` (a pose, o `facingPreview`, a precedência), "boardSightOf for Bia with Lyra looking in a cone" no `board-sight.spec.ts`, "lightSourcesOf in a cone" no `light-sources.spec.ts`, "sightNowOf while Lyra turns" no `use-board-sight.spec.ts`; `test/renderer/world-area.spec.ts`, "fogViewOf with Lyra looking in a cone", "lightAreasOf of a spotlight", "lightTintViewOf of a spotlight", "lightViewsOf of a spotlight", `light-aim-handle.spec.ts`, `handle-targets.spec.ts`, "pressRouteOf and the handle of a spotlight", `sight-cone-view.spec.ts` e, no `board-view.spec.ts`, "while Lyra turns", "while the master aims a spotlight" e "the outline of the field of view"; `test/lib/cone-form.spec.ts`, "the cone of a map light on the undo stack" no `edit-history.spec.ts`; `light-cone-flow.spec.ts`, a abertura no `light-reach-store.spec.ts` e no `light-tool-flow.spec.ts`, o desfazer do cone no `table-edit-store.spec.ts`; o evento e o reducer em `board-events.spec.ts` / `board-reducer.spec.ts`; `setLightCones` no `light-commands.spec.ts`.
- Componentes: `cone-angle-field.spec.tsx`; "the openings" no `vision-light-tab.spec.tsx`; "the field of view and the beam" no `token-dialog.spec.tsx`; "a lantern" no `token-preview.spec.tsx`; "Abertura (°)" no `light-panel.spec.tsx`; "while Lyra turns" no `scene-token-list.spec.tsx`; no `play-room-page-lights.spec.tsx`, a abertura das duas pegas com Ctrl+Z e "aiming a spotlight".
- E2E `e2e/test/vision-cone.spec.ts` (ver [`../ci/e2e.md`](../ci/e2e.md)).

## Armadilhas

- **A chave do filtro e da névoa leva a direção e a abertura.** A memória do `sightNowOf` (a pose no `landing`), a `key` da névoa (o `field` de cada olho), a do tingimento e a memória do `lightAreasOf` (o `cone`) incluem o cone; sem isso, girar não redesenha e a névoa fica olhando para o lado antigo.
- **O contorno do mestre respeita o alcance da visão.** Desenhado até a borda da cena, ele mostraria um cone de 20 casas a um token que enxerga 2 no escuro; o alcance é o mesmo da névoa do jogador (o `bright + dim` no Escuro).
- **A casa (16, 6) e além ficam sob o painel da sala no e2e** (o canvas mede o painel, ~0,05 de luminância, e não o chão): meça o canvas até a coluna 13.
