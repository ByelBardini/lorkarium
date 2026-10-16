# Client · tokens

Os tokens na sala: o que cada um vê, como se move e como se ajustam as barras. Server e redação em [`../tokens.md`](../tokens.md); a sala e o renderer em [`board.md`](board.md).

## Estado e comandos

- `board-store` aplica `token:created` / `token:updated` (troca no lugar, ou entra no fim), `token:moved` e `token:deleted` (`board-reducer.ts`), pela mesma regra de versão; conta `snapshots` (cada snapshot invalida a prévia local).
- `board-events.ts` valida os quatro eventos de token pelo DTO (`tokenCreated`, `tokenUpdated`, `tokenMoved`, `tokenDeleted`).
- `TableBoardCommands` ganhou `createToken`, `updateToken`, `moveToken`, `adjustBar`, `deleteToken`; falhas novas `token_not_found` (`TOKEN_NOT_FOUND`, `BAR_NOT_FOUND`) e `out_of_scene`; `INVALID_CONTROLLER` → `invalid`. `TableBoardCommandsFake.sentAs(nome)`.
- `board-interaction-store` (`createBoardInteractionStore({ campaignId, commands, describeRefusal })`): `selectedTokenId`, `preview` (`{ tokenId, col, row }`), `readOnly`; `select`, `moveToken(tokenId, casa, anúncio?)` (mostra a prévia, envia, limpa no ack — o `token:moved` chega antes dele; recusa limpa e diz o motivo), `adjustBar`, `setReadOnly` (limpa a prévia), `dropPreview`. Em `readOnly` nada é enviado. `useLocalBoardView(store)`: o pedaço local do `BoardView` num seletor raso.
- `use-interaction-follows-table.ts`: só leitura fora de `live` (sem fila, §5.6) e `dropPreview` a cada snapshot.
- Mensagens (`board-messages.ts`): `tokenCommandFailureMessage` (`forbidden` → "Esse token não é seu.", `out_of_scene` → "Fora da cena.", `rate_limited` → "Muitas ações seguidas. Espere um instante."), `selectedAnnouncement` ("Kael selecionado, coluna 8, linha 6") e `movedAnnouncement` ("Kael foi para a coluna 9, linha 6") — casas contadas a partir de 1.

## No tabuleiro

- `BoardView.tokens`: disco com iniciais, anel pelo lado (aliado `label`, inimigo `chart-3`, neutro `chart-2`), tamanho em casas, a barra de **posição 0** se veio (sem ela, nenhuma barra, mesmo com a 1), `selected`, `draggable` (`canControl` e não `readOnly`); `ghost` na casa da prévia; `tool`.
- `pixi-token-layer.ts`: um `Container` por token, atualizado por id; arraste centrado no ponteiro; volta à casa confirmada ao soltar; desliza 150 ms no movimento confirmado (instantâneo com `prefers-reduced-motion`); fantasma dourado na prévia.
- `token-drag.ts` (puro): `pressToken`/`movePress`/`releasePress` (a partir de 4 px é arraste, senão clique = `tokenPicked`) e `dropCellOf(cena, tamanho, ponto)` (encaixe pelo centro do token; fora da cena → `null`, e nada é enviado). Com a régua, apertar sobre um token mede.
- Intenções novas: `tokenPicked { tokenId }` e `tokenDropped { tokenId, cell }`; o `board-area` transforma a queda em `moveToken` (com o anúncio) e o resto vai ao `pointer`. Clicar no vazio com Selecionar tira a seleção. `BoardRenderer.viewCenterCell()`: a casa do centro da vista (onde nasce o token novo).

## Teclado (`use-board-keyboard.ts`, `src/lib/board-keys.ts`)

- Com o tabuleiro focado: `]` / `[` selecionam o próximo / anterior em ordem de leitura (linha, coluna, nome) e anunciam; as setas movem o selecionado uma casa (comando, com o anúncio do confirmado); token sem `canControl` → "Esse token não é seu." sem enviar; Enter abre o cartão (aba "Combate"); Esc tira a seleção (e sai do foco). Tab nunca é capturado.

## Painel (`src/features/tokens/`)

- `scene-token-list.tsx` — `SceneTokenList`: na aba "Combate", sob "Fora de combate", a lista "Na cena" por nome (iniciais, nome, quem controla, a primeira barra em texto). Cada linha é um botão `aria-expanded`; abrir seleciona no tabuleiro, e selecionar no tabuleiro abre e rola a linha. Cena vazia: "Crie um token pelo + na barra de ferramentas." (mestre) ou "O mestre ainda não pôs ninguém na cena.".
- `token-card.tsx` — `TokenCard` (`region` "Cartão de Lyra"): a casa ("Coluna 5, linha 5"), cada barra recebida (`BarLine`: rótulo, "−4 / 38" em `destructive-text`, trilho com traço vermelho no negativo) e, com `canControl`, o `BarField`; "Editar token" (mestre).
- `bar-field.tsx` — `BarField` ("PV de Lyra"): "−7"/"-7" tira, "+5" soma, "12" define (`parseBarInput`, `src/lib/bar-input.ts`), Enter envia e esvazia o campo (o valor mostrado é sempre o confirmado); − e + mexem 1; inválido marca `aria-invalid` e não envia; desabilitado em `readOnly`.
- `token-dialog.tsx` — `TokenDialog` ("Novo token" / "Editar token", só mestre; montado só aberto): `token-form.tsx` (nome; iniciais pelo `initialsOf` até serem editadas; Lado; Tamanho 1–4; "Quem controla" com os jogadores da presença) e `bars-editor.tsx` (até 8 barras: rótulo, atual — negativo vale —, máximo, cor entre Ouro/Aço/Brasa/Musgo/Cinza, "Todos veem" / "Só mestre e quem controla", ↑/↓ e remover; a primeira é PV, Brasa, oculta; "A primeira barra aparece no token."; com 8, "Máximo de 8 barras."). Valida pelo `updateTokenCommandDto` (`token-form-state.ts`: "Informe o nome do token.", "Dê um nome à barra.", "O máximo vai de 1 a 99 999."). "Salvando…" com `aria-busy`; recusa em `Alert`; "Excluir token" pergunta "Excluir Lyra? Isso não tem volta." antes do `token:delete`. `room-token-dialog.tsx` monta o diálogo sobre o tabuleiro confirmado e a casa do centro da vista.
- `src/components/choice-field.tsx` — `ChoiceField`: grupo de rádio em linha com legenda (lado, tamanho, cor com amostra, visibilidade).
- Libs: `bar-display.ts` (`barFill` → `{ fraction, state: normal | negative | over }`, `formatBarValue` com o sinal tipográfico, `barToneVar(cor)` → `var(--chart-n)`, `BAR_COLOR_LABEL`), `token-initials.ts` (`initialsOf`: "Ogro das Cinzas" → "OC", "Kael" → "KA").

## Testes

- `client/test/lib/` (barra, entrada, iniciais, teclas), `client/test/renderer/` (`board-view` com tokens, `token-drag`), `client/test/stores/` (tokens na store, interação), `client/test/features/tokens/` (estado do formulário, diálogo, editor de barras, lista e cartão), `client/test/features/board/board-keyboard.spec.tsx` e os casos de arrastar/soltar no `play-room-page.spec.tsx`. Fixtures `lyra()`, `tokenCreatedAt`, `tokenMovedAt`, `tokenUpdatedAt`, `tokenDeletedAt`.
- E2E: `e2e/test/tokens.spec.ts` (três navegadores: barra oculta, teclado, recusa, valor negativo, arraste com o mouse, F5).

## Armadilhas

- No `user-event`, `[` abre um descritor de tecla: o colchete literal é `keyboard('[[')`.
