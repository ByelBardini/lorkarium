# Client · chaves de token da mesa (o jogador cria, edita e exclui os seus)

Como a sala aplica as duas chaves da mesa ("Jogadores criam e editam tokens", "Jogadores excluem os próprios tokens"). A regra mora no game-core (`token-rights.ts`, ver [`../game-core.md`](../game-core.md)) e o server a usa para recusar; o client só esconde os botões com a mesma função. Plano de origem: [`2026-10-26-permissoes-de-token-dos-jogadores.md`](../../plans/2026-10-26-permissoes-de-token-dos-jogadores.md).

## A regra no client

- `src/lib/token-rights-of-viewer.ts` (nunca reescreve a regra): `tableTokenRightsOf(campanha)` (`playersCreateTokens`/`playersDeleteTokens` → `{ create, delete }`), `liveTableTokenRightsOf(mesa, campanha)` (o `tokenRights` da `OpenTable`, gravado pelo `session:campaignUpdated`; `null` até o primeiro — o F5 restaura a mesa sem ele — e aí vale a campanha da rota), `viewerTokenRightsOf(chaves, viewer)` → `{ canCreate, of(token) → { edit, delete } }` (sem viewer, com o tabuleiro carregando: nada) e `roleCanCreateTokens(papel, chaves)` (a toolbar sabe o papel antes do tabuleiro dizer quem é o viewer).
- `features/board/table-token-rights.ts`: `useRoomTokenKeys(openTables, campanha)` na `play-room-page`, que dá o `TableTokenKeysContext` (fora da sala, as duas desligadas: só o mestre) e passa as chaves ao `useEditShortcuts`; `useViewerTokenRights(board)` junta as chaves ao `board.viewer`. Desligar a chave tira os botões ao vivo, sem F5.
- Token ligado à ficha (`anchorTokenId`) ou com `createdBy` nulo (anterior aos autores) é só do mestre; o espectador nunca recebe.

## Quem vê o quê

- "Novo token" na toolbar: `canCreate` (ver [`board.md`](board.md)).
- "Editar token" no rodapé do detalhe (`TokenDockActions`): `of(token).edit` — o mestre, ou quem criou o token solto, com a chave de criar.
- "Editar token…" no menu do botão direito (`TokenContextMenu.onEditToken`, primeiro item, separado do resto): a mesma regra `of(token).edit`; age só no token clicado, nunca na seleção, e a `play-room-page` abre o mesmo `RoomTokenDialog` do rodapé (`setTokenDialog({ tokenId })`). Sem `onEditToken`, o item não existe.
- O diálogo no modo jogador (sem "Visão e luz", criador travado em "Quem controla", "Excluir token" pela chave de excluir): [`token-dialog.md`](token-dialog.md).
- Delete com tokens (`use-board-keyboard.ts`): só os que o viewer pode excluir vão ao `DeleteSelectionDialog`; os outros ficam e a descrição diz "1 token que não é seu fica." (`keptTokensNotice`, `SelectionToDelete.keptTokens`). Sem nenhum excluível, desenhos, áreas, paredes e luzes vão na hora, como antes.
- Ctrl+V cola os tokens copiados com `canCreate` (sem ela, só desenhos e áreas e "Só o mestre cola tokens."). `EditContext.tokenRights` = `{ canCreate, canDelete(id) }` (o `useEditShortcuts` monta pelo tabuleiro; token que sumiu do tabuleiro conta como sem autor). O desfazer de uma criação sem a chave de excluir, e o refazer de uma criação sem a de criar, é **pulado**: sai da pilha sem enviar (`canRunEditEntry`, outcome `skipped` → "Você não tem mais permissão para essa ação; ela saiu do desfazer.", `EDIT_SKIPPED`).

## Testes

- Sem DOM: `test/lib/token-rights-of-viewer.spec.ts` (a regra pela mesa aberta, o `campaignUpdated` que desliga a chave sem tocar nos tokens) e o bloco "a player under the room's token keys" de `test/stores/table-edit-store.spec.ts`.
- Componentes: `test/features/board/token-context-menu-edit.spec.tsx` (o "Editar token…" do menu pela regra), `test/features/board/play-room-page-token-rights.spec.tsx` (o "Novo token" some e volta sem F5; o diálogo da Bia), os casos de jogador em `board-toolbar.spec.tsx`, `token-dock.spec.tsx` (`renderDock(…, false)` usa o viewer da Bia) e `play-room-page-delete.spec.tsx`.

## Armadilhas

- A `play-room-page` é quem dá o `TableTokenKeysContext`: hooks chamados nela mesma (como o `useEditShortcuts`) não o enxergam e recebem as chaves por parâmetro (`tokenKeys`).
- O seletor do `useOpenTables` precisa devolver a mesma referência: devolver um objeto novo de chaves a cada leitura faz o `useSyncExternalStore` renderizar sem fim. O `useRoomTokenKeys` lê o `tokenRights` cru e monta as chaves num `useMemo`.
