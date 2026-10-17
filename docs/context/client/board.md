# Client · sala de jogo e tabuleiro

A tela de `/campaigns/:campaignId/table`: o tabuleiro ocupa a tela inteira e o resto flutua por cima. Plano de origem: `docs/plans/2026-10-15-tela-sala-de-jogo.md`; mockup: `docs/pages/mesa/Mesa.dc.html` (base, não lei). Server e contrato em [`../board.md`](../board.md).

## Sala (`src/features/board/`)

- `play-room-page.tsx` — `PlayRoomPage({ campaign, openTables, roomLayout, clipboard, createBoardRenderer, boardCommands })`, montada pela rota com `key={campaign.id}`. Abre a mesa pelo `useOpenTable` (presença **e** tabuleiro), cria a `board-interaction-store` da visita e guarda o renderer montado (para zoom e enquadrar). Fora do modo foco: topo, toolbar e painel; o `FocusToggle` e a linha de status ficam sempre.
- `room-header.tsx` — `RoomHeader`: `section` "Topo da sala" de 48px com o `h1` (nome), "N online" (texto, abre a aba "Na mesa"), o código formatado + "Copiar código" (só mestre, a partir de `lg`), `PanelToggle` e "Sair da mesa" (`useLeaveTable`).
- `room-panel.tsx` — `RoomSidePanel`: `aside` "Painel da mesa" de 320px sobre a direita (`md+`, quando aberto) ou `Sheet` inferior aberta pelo botão "Painel" (abaixo de `md`, pelo `useMediaQuery(DESKTOP_QUERY)`). Abas (`tabs` do shadcn, sublinhado dourado): "Combate" ("Fora de combate" por enquanto) e "Na mesa" (`SessionPresencePanel`). `PanelToggle`: "Recolher painel" ↔ "Abrir painel" (`aria-expanded`), só no desktop.
- `board-area.tsx` — `BoardArea`: o que fica atrás da UI. Limite de mesas → alerta `TOO_MANY_TABLES_MESSAGE`; falha da sessão → `sessionFailureMessage`; falha do sync → "Não deu para carregar o tabuleiro." + "Tentar de novo" (`board.retry()`); carregando → nada; pronto → `BoardCanvas` com o grid local e a régua da store de interação.
- `board-canvas.tsx` — `BoardCanvas`: o host do renderer. `div` `role="application"`, `aria-roledescription="tabuleiro"`, `aria-label` "Tabuleiro: Cena 1, 20 × 12 casas", `tabIndex=0`, instruções de teclado em `aria-describedby`. Um renderer por montagem (`createBoardRenderer(onIntent)` → `mount(host)` → `draw(BoardView)` a cada mudança); destruído na desmontagem, inclusive com o `mount` ainda pendente. `mount` que rejeita → "Seu navegador não conseguiu abrir o tabuleiro.".
- `board-toolbar.tsx` — `BoardToolbar`: `toolbar` vertical "Ferramentas do tabuleiro" à esquerda: Selecionar (V), Régua (R), Desenhar (B, abre o painel de estilo; ver [`drawings.md`](drawings.md)), Grid (G, só local), Aproximar (+), o zoom em % (`pt-BR`), Afastar (−), Enquadrar cena (0), o grupo "Camada" (`role="group"`, só com `canChooseLayer`: Tokens (1), Objetos (2), Fundo (3), `aria-pressed` na ativa) e, para o mestre, "Novo token" e "Configurar grid". Ferramenta ativa = `aria-pressed` + ícone dourado; sem renderer, os botões de câmera ficam desabilitados.
- `configure-grid-dialog.tsx` — `ConfigureGridDialog` (montado só aberto): largura e altura em casas, distância de uma casa ("1,5"), unidade, opacidade (%) e "Grid visível". Os números são campos de texto (`inputMode`, **nunca** `type="number"`: sem setas) filtrados ao digitar (`digitsOnly`; a distância pelo `decimalText`, uma vírgula ou ponto); "Unidade" é um `select` com cm, m e km (`unitOptionsOf(atual)` mantém uma unidade antiga, como ft, como opção a mais; o DTO continua aceitando texto de 1 a 8). Valida pelo `sceneGridDto` do contracts (`grid-form.ts`: `gridFormOf(cena)`, `parseGridForm(form)` com a mensagem por campo, `aria-invalid` + `aria-describedby`); "Salvando…" com `aria-busy`; ok fecha; recusa em `Alert` (`boardCommandFailureMessage`). Sem conexão (`presence.status !== 'live'`): "Salvar" desabilitado e "Sem conexão. Aguarde reconectar." (não há fila).
- `board-status-line.tsx` — `BoardStatusLine`: `role="status"` "Status do tabuleiro", `aria-live="polite"`: a conexão enquanto não está pronta (`connectionStatusLine`: "Conectando à mesa…", "Reconectando…", "Carregando o tabuleiro…") e depois o aviso da store de interação (dica da ferramenta, motivo de recusa).
- `focus-toggle.tsx` — "Modo foco" (`aria-pressed`), sempre visível. `use-room-shortcuts.ts` — atalhos na `window` pelo `shortcutFor`: F (foco), Esc (sai do foco e limpa a régua), V, R, G, e 1 / 2 / 3 (camada ativa; o jogador fica em Tokens porque `setActiveLayer` não faz nada sem `canChooseLayer`).
- `token-context-menu.tsx` — `TokenContextMenu({ request: { tokenId, x, y }, board, interaction, onApplyCondition, onClose })`: o menu "Ações de Kael" do `DropdownMenu` (controlado, ancorado num ponto invisível na posição do clique; nomeado por um `sr-only` via `aria-labelledby`), com "Aplicar condição…" (abre o `ApplyConditionDialog` com a seleção inteira se o token está nela, senão só ele; ver [`combat.md`](combat.md)) e o grupo "Mover para camada": Tokens/Objetos/Fundo como `menuitemradio` com a camada do token marcada; escolher manda o `setTokensLayer` da seleção inteira se o token está nela, senão só dele; Esc ou clicar fora fecha sem enviar; recusa → linha de status. A `play-room-page` guarda o pedido (`onTokenMenu` do `board-area`, que recebe o `tokenMenuRequested`) e chama `allowLayerChoice(myRole === 'master')`. Os nomes das camadas (`LAYER_LABEL`) estão no `board-messages.ts`.
- `board-messages.ts` — `connectionStatusLine`, `BOARD_LOAD_FAILED`, `DISCONNECTED_COMMAND`, `boardCommandFailureMessage` (`forbidden` → "Só o mestre pode fazer isso.", `rate_limited` → "Muitas ações seguidas. Espere um instante.", offline/inesperado reaproveitam o `campaign-messages`).

## Renderer (`src/renderer/`, sem React)

- `camera.ts` — `Camera { offsetX, offsetY, zoom }` (tela = mundo × zoom + offset), `CELL_WORLD_SIZE = 64`, `ZOOM_LIMITS` 0,25–4; `worldToScreen`/`screenToWorld`, `panBy`, `zoomAt` (o ponto sob o cursor fica parado), `fitScene` (centraliza com 32px de margem), `clampToScene` (25% da cena sempre na tela), `zoomProofTextResolution(dpr)` (a `resolution` de todo `Text` do mundo: rasterizado para o zoom máximo, não pixela ao aproximar).
- `board-cursor.ts` (puro) — `boardCursorOf({ tool, drawKind, panning })`: `move` no pan do botão direito, régua (`RULER_CURSOR`) medindo, caneta (`PEN_CURSOR`) na mão livre, `crosshair` nas formas, seta no resto. Caneta e régua são SVG em data URL com o ponto quente na ponta e `crosshair` de reserva. O `pixi-board-renderer` aplica no canvas a cada `draw` e ao começar/terminar o pan.
- `camera-input.ts` — mapa de entradas: roda move (Shift = horizontal; `deltaMode` linhas × 16), Ctrl/⌘ + roda e pinça aproximam no cursor; W A S D a 600 px/s com a diagonal normalizada (`keyboardPan`); `cameraKeyAction`: `+`/`=`, `-`, `0` (com Ctrl/⌘/Alt é do navegador); botão direito arrastado (`startRightDrag`/`moveRightDrag`, a partir de 4 px).
- `grid-geometry.ts` — `visibleWorldRect`, `gridLines(cena, visível)` (só as linhas na tela; sem as horizontais quando a vista não cruza a largura da cena, e vice-versa), `cellAtWorld` (a borda final é da última casa; fora → `null`).
- `board-view.ts` — `buildBoardView({ scene, localGridVisible, ruler, drag, dragged, selectedTokenIds, activeLayer, canChooseLayer, … })` (`layerMenu` = `canChooseLayer`): os tokens saem na ordem de desenho (Fundo → Objetos → Tokens; dentro da camada, a da lista), cada `TokenView` com `layer`, `pickable` (= está na camada ativa) e `draggable` (= `pickable` e `canControl` e não `readOnly`); → `BoardView { sceneSize, grid { visible (cena **e** local), opacity 0–1, cells }, ruler { points, label } }`; régua pelo `pathDistance` do game-core (desenhada como polilinha com ponto em cada curva) e o `rulerLabel` (`src/lib/ruler-label.ts`: "3 casas · 4,5 m").
- `board-renderer.ts` — `BoardRenderer` (`mount`, `draw`, `zoomBy`, `fitScene`, `destroy`) e as intenções (`cameraChanged`, `pointerDown/Move/Up` com a casa, `tokensMarqueed { tokenIds, additive }`, `tokenMenuRequested { tokenId, x, y }` em px da viewport).
- `marquee.ts` (puro) — `startMarquee`/`moveMarquee` (vira retângulo a partir de 4 px de tela, como o arraste de token), `marqueeRect` (normalizado, arrastado em qualquer direção), `tokensInMarquee(rect, tokens)` (os `draggable` — na camada ativa e com `canControl` — que o retângulo **toca**: uma casa de um token grande basta) e `layerMenuTarget(view, token)` (o clique direito curto só abre o menu com `view.layerMenu` e sobre token `pickable`). `pixi-marquee.ts` desenha o retângulo dourado tracejado. `CreateBoardRenderer` está no `AppDependencies` (`createBoardRenderer`).
- `pixi-board-renderer.ts` — `createPixiBoardRenderer`: casca fina sobre PixiJS 8 (apertar no vazio com Selecionar começa o retângulo; Shift não limpa a seleção e soma; soltar manda `tokensMarqueed`; Shift+clique num token = `tokenPicked { additive: true }`; botão direito curto = `tokenMenuRequested`) (`Application.init({ resizeTo: host })`, fundo `panel`, cena `card`, grid dourado em linhas finas `1/zoom` só no visível, régua dourada com rótulo). Roda com `{ passive: false }`; `contextmenu` cancelado no canvas; teclas no host focável, não na `window`; W A S D pelo `ticker`. Provado pelo e2e.

## Estado (`src/stores/`)

- `board-store.ts` — `createBoardStore(campaignId, requestResync)`, **uma por mesa aberta** (criada pela `open-tables-store` ao lado da presença; o `useOpenTable` devolve `{ kind: 'open', presence, board }`). `{ status: loading | ready | failed, failure, board, held, resyncAsked }`. Snapshot sempre substitui e reaplica os eventos guardados acima dele; evento com `version = atual + 1` aplica (`board-reducer.ts`), `≤ atual` é duplicado, salto guarda o evento e pede **um** resync até o próximo snapshot; evento antes do primeiro snapshot espera; de outra mesa é ignorado. Falha de resync mantém o tabuleiro; `retry()` volta a `loading` e pede o sync.
- `board-interaction-store.ts` — `createBoardInteractionStore()`, uma por visita: `tool` (`select` | `ruler` | `draw`), `localGridVisible`, `ruler` (de onde apertou até onde está; fica depois de soltar), `notice`, `zoom`; `pointer(intent)`, `setTool`, `toggleLocalGrid`, `escape`, `say(aviso)`. Nada daqui vai ao server.
  - Seleção: `selectedTokenIds` (a lista) e `selectedTokenId` (derivado: o id quando há exatamente um, senão `null` — o que o cartão e as teclas usam); `select(id | null)`, `toggleSelection(id)` (Shift: soma ou tira), `selectMany(ids, { additive })` (o retângulo: substitui ou soma sem repetir). Esc e clicar no vazio esvaziam.
  - Camada ativa: `activeLayer` (`tokens` de início) e `canChooseLayer` (`allowLayerChoice(true)` para o mestre; `false` volta a `tokens`); `setActiveLayer(camada)` só com a escolha liberada, e limpa a seleção e a régua; `setTokensLayer(ids, camada)` manda o `token:setLayer` (recusa → aviso; `readOnly` → nada).
- `room-layout-store.ts` — `createRoomLayoutStore(storage)` no `AppDependencies` (`roomLayout`): `panel` (`open`/`closed`, gravado em `lorkarium.roomPanel`), `tab` (`combat`/`people`, `isRoomTab`) e `focus` (não gravados). `showTab` abre o painel.

## Serviços

- `table-visit.ts` — a visita de uma mesa (saiu do `table-session-api.ts`): depois do ack do `session:join`, emite `board:sync` e entrega `{ kind: 'board', state }` ou `{ kind: 'boardFailed', failure }` (`not_found`, `unauthenticated`, `unexpected`, `offline` — 5 s sem ack); a cada reconexão, join e sync de novo. Eventos do tabuleiro pelo `parseBoardEvent` (`board-events.ts`): da mesa e válido → `{ kind: 'boardEvent', event: { type, payload } }`; de outra mesa → ignorado; da mesa e fora do DTO → descartado e sync de novo. O handle ganhou `resync()`.
- `table-board-commands.ts` — `TableBoardCommands` / `RealtimeTableBoardCommands(transport, newActionId)` sobre **o mesmo** transporte da sessão (`main.tsx`): `configureScene(campaignId, grid)` → `{ ok, version }` | `{ ok: false, failure }` (`FORBIDDEN` → `forbidden`, `CAMPAIGN_NOT_FOUND`, `INVALID_BODY`, `RATE_LIMITED`, `UNAUTHENTICATED`, 5 s → `offline`, ack fora do DTO → `unexpected`). Nunca lança.

## Atalhos

| Tecla             | Onde                | Faz                                           |
| ----------------- | ------------------- | --------------------------------------------- |
| F                 | sala                | liga/desliga o modo foco                      |
| Esc               | sala / arrastando   | sai do foco, limpa a régua, cancela o arraste |
| V / R / B / G     | sala                | Selecionar / Régua / Desenhar / grid local    |
| 1 / 2 / 3         | sala (mestre)       | camada ativa: Tokens / Objetos / Fundo        |
| + = / − / 0       | tabuleiro focado    | aproxima / afasta / enquadra                  |
| W A S D           | tabuleiro focado    | move a câmera                                 |
| Roda / Ctrl+roda  | sobre o tabuleiro   | move / aproxima no cursor                     |
| Botão direito     | arrastado no canvas | move a câmera                                 |
| Botão direito     | clique sobre token  | "Aplicar condição…" e camada (só o mestre)    |
| Arrastar no vazio | Selecionar          | retângulo de seleção (Shift soma)             |
| Shift+clique      | token ou desenho    | soma/tira da seleção                          |
| Delete / ⌫        | tabuleiro focado    | apaga os desenhos selecionados                |
| Ctrl/⌘ + C / V    | sala                | copia a seleção / cola sob o cursor           |
| Ctrl/⌘ + Z        | sala                | desfaz a última ação sua                      |
| Ctrl/⌘ + Y, ⇧Z    | sala                | refaz                                         |

Ignorados em `input`, `textarea`, `select`, `contenteditable`, dentro de diálogo/menu e com Ctrl/⌘/Alt (`src/lib/board-shortcuts.ts`). Os de edição (`editShortcutFor`) exigem Ctrl/⌘, sem Alt, com as mesmas exceções de alvo.

## Testes

- Sem DOM: `client/test/renderer/` (câmera, entrada, geometria, `BoardView`, cursor), `client/test/lib/` (atalhos, régua, `stored-choice`), `client/test/stores/` (tabuleiro, interação, layout) e `client/test/services/` (`board-events`, `table-board-sync`, `table-board-commands`).
- Componentes: `client/test/features/board/` — a sala pelo router inteiro (`play-room-page.spec.tsx`, que levou os casos da tela provisória), o canvas, o toolbar, o diálogo e o `grid-form`.
- Fakes: `BoardRendererFake` / `BoardRenderersFake` (`test/support/board-renderer-fake.ts`, `deps.boardRenderers`; `mountMode` `resolve` | `hold` | `reject`), `TableBoardCommandsFake` (`deps.boardCommands`), `RealtimeTransportFake.answerAck(resposta, evento)` (o ack mais antigo **daquele evento**), `emulateViewport('mobile')` (`test/support/viewport.ts`), fixtures `vharnBoard`, `VHARN_SCENE`, `sceneUpdated`.
- E2E: `e2e/test/board.spec.ts`.

## Armadilhas

- Com um diálogo modal aberto, o Radix deixa o resto da página `aria-hidden`: no teste, `getByRole(…, { hidden: true })` ou confira a store.
- O PixiJS não roda no jsdom: a sala recebe o renderer por `createBoardRenderer` e o teste injeta o fake. O adaptador PixiJS só se prova no e2e.
- `Application.init` é assíncrono e o `StrictMode` monta, desmonta e monta: o adaptador marca `destroyed` e, se o `init` terminar depois, destrói o que ele criou; o host só usa o renderer cujo `mount` resolveu com a montagem ainda viva.
- O `DropdownMenuContent` do Radix põe o próprio `aria-labelledby` (o gatilho), que vence um `aria-label`: para nomear o menu, passe `aria-labelledby` apontando para um texto seu (um `sr-only` dentro do conteúdo serve).
