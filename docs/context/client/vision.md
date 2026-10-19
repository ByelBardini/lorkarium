# Client · visão (quem vê o quê) e névoa

O que cada viewer vê do tabuleiro: o modo de visão da cena, o alcance de cada token, o filtro que esconde e vira silhueta, a névoa, a rota que contorna parede e a prévia do mestre. A regra (área, linha de visão, nível de cada token, porta vista) mora no game-core ([`../game-core.md`](../game-core.md), Visão); paredes e portas em [`walls.md`](walls.md) e [`../walls.md`](../walls.md). Plano de origem: `docs/plans/2026-10-18-visao-e-paredes.md`.

> **O client esconde, o server manda tudo** (decisão do plano): o jogador recebe todos os tokens e paredes, e pelo DevTools vê tudo. Esconder no server fica para um plano de endurecimento.

## Formulários e unidade

- `src/lib/sight-form.ts` — o alcance é digitado **na unidade da cena** ("18 m" = 12 casas com 1,5 m) e guardado em casas. `SightFields` `{ sees, bright, dim, saved }` (texto até salvar; `saved` = o token já enxergava), `SceneDistance` `{ cellDistance, cellUnit }`. `sightFieldsOf(sight, distância)` (`{ 12, 4 }` → "18" e "6"; `null` → "Enxerga" desligado), `parseSightFields(campos, distância)` → `{ ok, sight }` em casas ao centésimo ("10" m → 6,67; "1,5" e "1.5" valem; cada campo de 0 a 100 casas, dito na unidade: "De 0 a 150 m."; plena vazia → "Informe a visão plena."; penumbra vazia = 0; desligado → `null` se `saved`, senão `undefined` = não manda), `sightCellsHint(texto, distância)` ("= 12 casas").
- `features/tokens/sight-section.tsx` — `SightSection`: a seção "Visão" do `TokenForm` (checkbox "Enxerga"; marcado, "Visão plena (m)" e "Penumbra (m)" com a dica de casas embaixo e "Na penumbra, vê o mapa, mas não vê tokens."). O `token-form-state.ts` ganhou `sight` nos valores e nos erros; `tokenFormOf(token, distância)` e `parseTokenForm(form, distância)` (o `sight` entra no DTO só quando vai). O `TokenDialog` recebe `distance` (o `RoomTokenDialog` passa o `cellDistance`/`cellUnit` da cena).
- "Configurar cena": o `ChoiceField` "Visão dos tokens" (`VISION_OPTIONS` do `grid-form.ts`: Desligada, Escuro, Luz do dia; `VISION_HINT`) manda `vision` no `configureScene(mesa, grid, fundo, vision)` (o `TableBoardCommands` e o fake ganharam o parâmetro; ausente mantém o modo).
- Copiar e colar leva o `sight` (`copiedOf` → `newTokenOf`).

## O filtro (quem cada um vê)

- `src/lib/board-sight.ts` — `boardSightOf(board, { previewEyeIds, landing? })` → `BoardSight { active, mode, levels, eyes, eyeTokenIds, noEyes, seenDoorIds, previewBlind }`, sobre o `sightLevel` e o `doorSeenBy` do game-core (a mesma regra da porta no server). O **jogador** olha pelos tokens que controla (`canControl`); o **mestre** vê tudo (`active: false`) a não ser na prévia (`previewEyeIds` = os selecionados). Visão `off` → tudo visto e toda porta aparece (`seenDoorIds: null`). O token do próprio viewer é sempre visto; o de **Fundo** é cenário (visto onde seria silhueta). No escuro sem olho → `noEyes` e só os dele aparecem. `levelOf(sight, id)` (quem não está em `levels` é visto) e `seenTokensOf(board, sight)` (o que se vê inteiro).
- `features/board/use-board-sight.ts` — `useBoardSight(board, interaction)` (memorizado pelo tabuleiro confirmado e pela prévia; é o estado **confirmado** que o filtro lê, então um token novo só aparece quando o movimento é confirmado), `sightNowOf(board, interação)` (fora do React, para as teclas) e `previewEyeIdsOf`.
- **Onde vale** (um filtro só): o `buildBoardView` (`BoardViewInput.sight`: o escondido não sai; o de penumbra vira silhueta — `TokenView.silhouette` `'round' | 'square'`, sem nome, iniciais, imagem, barra, condições, marca de direção nem anel de vez, `pickable` e `draggable` falsos; as portas do jogador pelo `seenDoorIds`), a lista "Na cena" (`SceneTokenList` só com `seenTokensOf`), o `]`/`[` e as setas (`use-board-keyboard.ts`) e o menu do token (a silhueta não é pegável, então o `topTokenAt` e o `tokenMenuTarget` nunca a acham; nem nome no hover).
- `pixi-token-layer.ts` — a silhueta é a forma preta da pegada a 90% (elipse na borda redonda, retângulo na quadrada), sem placa de nome.
- Linha de status: no escuro sem olho, "Nenhum token seu enxerga nesta cena." (`NO_EYES`, quando não há outro aviso).

## A névoa

- `src/renderer/fog-view.ts` — `fogViewOf({ sight, scene, walls, tokens, landing })` → `FogView { width, height, dim, bright, holes, key }` em px de mundo, ou `null` sem nada escondido. Cada olho dá a área de penumbra (`sightArea` até `bright + dim`) e a plena (até `bright`); na Luz do dia a plena não tem limite e a penumbra é a própria plena. `holes` = os retângulos dos tokens do viewer (nunca ficam no escuro). `landing` (o arraste deste viewer, do `drag.landing`) move os olhos para onde os tokens cairiam: a névoa acompanha o arraste. `key` = modo + olhos + paredes; igual → o canvas não redesenha.
- `BoardView.fog`; `pixi-fog-layer.ts` — `PixiFogLayer`: duas folhas do tamanho da cena, uma opaca com máscara **inversa** (`setMask({ mask, inverse: true })`) das áreas de penumbra + buracos, outra a 55% com a inversa das plenas + buracos; redesenha só quando a `key` muda. Fica acima do mundo e dos tokens e abaixo das linhas de parede, ícones de porta, alças, régua e retângulo. Provado pelo e2e.

## O arraste contorna a parede

- `token-route.ts` — `stepRoute(rota, casa, agora, blocked?)` (`RouteBlock`: o trecho de uma casa a outra bate em parede): sem `blocked` (o mestre), reta como antes; com a parede no caminho, a rota **dobra** na última casa livre (a que via a âncora e o destino); se nem assim passa, fica na casa de antes. Voltar sobre a curva a desfaz. `routeBends(rota)` → o `path` do comando.
- `token-drag-flow.ts` — o `DragGroup` ganhou `walls` (os VO do game-core; o `board-area` só manda para quem não é mestre). A âncora anda pela rota que dobra; o grupo cai pela casa onde a rota parou; soltar manda `moveToken(…, path)` com as curvas, ou `moveTokens` com o caminho de cada membro deslocado do da âncora. Se um membro cruzaria parede (`blockedPassage` do game-core sobre os centros), nada vai e a linha diz "Uma parede bloqueia o caminho." (`describeRefusal('wall_blocked')`).
- `TableBoardCommands.moveToken(mesa, token, casa, path?)` e o `TokenMoveTarget.path`; o `TokenMove` do `edit-history.ts` guarda o `path` e o inverso o percorre ao contrário; o `table-edit-store` manda o caminho invertido com o `expect`.
- Setas do teclado: o passo do jogador que cruza parede → a mensagem, sem comando; o mestre passa.

## A prévia do mestre

- `board-interaction-store`: `sightPreview` e `toggleSightPreview()` (só quem escolhe camada, o mestre; tirar o papel desliga); `followVision(modo)` desliga com a cena em `off` (o `useInteractionFollowsTable` chama a cada mudança do tabuleiro).
- `board-toolbar.tsx` — "Ver como os selecionados" (ícone `Eye`, `aria-pressed`), só para o mestre numa cena Escuro ou Luz do dia (`sightOn`, pelo `RoomToolbar` do `play-room-page.tsx`).
- Com a prévia ligada, o `useBoardSight` usa os selecionados como olhos: o mestre vê os níveis e a névoa deles. Sem token selecionado que enxerga → nada escondido e "Selecione um token que enxerga para ver como ele." (`previewBlind`, `PREVIEW_BLIND`).

## Testes

- Sem DOM: `test/lib/sight-form.spec.ts`; o `sight` em `test/lib/paste-placement.spec.ts`; `test/lib/board-sight.spec.ts` (a Bia no escuro, os modos, o mestre, a prévia); `test/renderer/board-view.spec.ts` (a silhueta e o escondido); `test/renderer/fog-view.spec.ts`; `test/lib/token-route.spec.ts` e `test/stores/token-drag-flow.spec.ts` (a parede); o `path` em `edit-history.spec.ts` e `table-edit-store.spec.ts`; a prévia em `test/stores/board-interaction-store.spec.ts`.
- Componentes: a lista da Bia em `test/features/tokens/scene-token-list.spec.tsx`; `]` e as setas contra a parede em `test/features/board/board-keyboard.spec.tsx`; `test/features/board/board-status-line.spec.tsx`; o botão em `test/features/board/board-toolbar.spec.tsx`.

## Armadilhas

- **Todo consumidor de `board.tokens` que mostra token ao jogador passa pelo filtro** (`useBoardSight` / `sightNowOf` + `seenTokensOf` ou `levelOf`). Uma lista, um anúncio ou um atalho novo que lê `board.tokens` direto mostra o escondido. O tracker, a linha da vez e o anúncio da vez passam (`combatant-list.tsx`, `turn-line.tsx`, `combat-header.tsx`, `use-interaction-follows-table.ts`, pelo `entryLabelOf`/`entryTokensOf` com os vistos).
- O `DragGroup` sem `walls` é o mestre (passa por tudo); o `dragOf` do `token-drag-flow` precisa copiar o `walls` do grupo, senão a rota nunca dobra.
- Componentes: "Visão" em `test/features/tokens/token-dialog.spec.tsx` (marcar mostra os campos e a dica; criar manda `{ bright: 12, dim: 4 }`; editar mostra "18" e "6"; desmarcar manda `null`; 151 m é recusado no campo) e "Visão dos tokens" em `test/features/board/configure-scene-dialog.spec.tsx`.
