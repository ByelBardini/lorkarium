# Client · personagem global (elenco, token ligado, ficha)

O server (elenco, âncora, ligação, escritas na âncora, "Adicionar jogadores") está em [`../tokens/character.md`](../tokens/character.md); as abas de grid em [`grid-tabs.md`](grid-tabs.md). Hub: [`../client.md`](../client.md).

## O elenco na mesa aberta (B7)

- `OpenTableRef` = `{ campaignId, name, castSceneId }` (o `castSceneId` vem do `campaignDetailDto`, pelo `useOpenTable`); a lista do `sessionStorage` (`lorkarium.openTables`) guarda os três — lista gravada sem o `castSceneId` (versão anterior) é inválida e volta vazia (a sala reabre a mesa).
- `OpenTable.cast` (e `OpenTableView.cast`): a `board-store` do elenco, criada pela `open-tables-store` e alimentada por `TableSessionHandle.followCast(castSceneId, listener)` → `CastHandle { resync }`.
- `table-visit.ts`: o elenco **nunca** recebe `scene:watch` (o server recusa): é `board:sync { sceneId: castSceneId }` depois do join e do sync do grupo, antes de cada `scene:watch` (também a cada reconexão). Evento com o `sceneId` do elenco vai **só** ao listener do elenco (mesmo antes de o grupo ser conhecido); evento inválido do elenco ressincroniza o elenco.
- `condition:changedMany` → `{ type: 'conditionsChanged', payload }` (`board-events.ts`); o reducer troca as condições de cada `tokenId` listado (as âncoras).
- Fake: `TableSessionApiFake.castFollowed` / `castResyncs` (`<cid>:<sid>`) e `emitToCast(campaignId, …updates)`.

## Token ligado composto (`src/lib/linked-tokens.ts`)

- `resolveLinkedTokens(tokens, anchors)`: o token com `anchorTokenId` leva da âncora `name`, `initials`, `side`, `imageAssetId`, `frame`, `defeated`, `bars`, `conditions`, `controllerIds` e `canControl`; posição, tamanho, camada, direção, inverter, visão, cone e luz são dele. Solto, ou âncora ainda desconhecida (elenco carregando), passa igual.
- `boardWithCast(board, cast)`: o board da aba com os ligados resolvidos, as condições dos tokens soltos acompanhando a lista do elenco (`tokensOverCatalog`: editada e excluída nas Configurações; ver [`conditions.md`](conditions.md)) **e** `memberCards` e `conditionDefinitions` do elenco (B8: a versão da mesa é a do elenco; a cópia do snapshot do grid para no snapshot). `cast: null` → o próprio board.
- Memo por identidade (`WeakMap`): a mesma entrada devolve o mesmo objeto; nada mudou → a entrada. O token resolvido guarda os arrays da âncora, então a comparação por referência para de trocar objeto enquanto nenhum lado muda.
- **Onde se aplica:** dentro da `board-store`. `createBoardStore(campaignId, resync, castOf?)`: todo estado que sai do `apply` passa por `boardWithCast(board, castOf())`, e `relink()` refaz quando o elenco muda. A `scene-tabs-store` (`deps.cast`) assina o elenco e chama `relink()` de toda aba; a aba extra nasce com `castOf`. Assim canvas, painéis, teclado e intenções (que leem `board.getState().board`) veem o mesmo token composto.

## Ligar, desligar e "Adicionar jogadores" (B9)

- `src/services/token-link-commands.ts`: `TokenLinkCommands` (`linkTokenToCard(scope, tokenId, memberId)`, `unlinkTokenFromCard(scope, tokenId)`, `addPlayers(scope, center)` → `AddPlayersResult` com `createdIds` e `skippedMemberIds`) / `RealtimeTokenLinkCommands`; o `TableBoardCommands` o estende. `BoardCommandSender.ask` devolve o ack cru (`CommandAnswer`) para o ack próprio do `addPlayersAckDto`. Falhas novas: `character_already_placed` ("Esse personagem já tem um token neste grid."), `token_not_linked`, `no_free_cells` ("Não há casas livres neste grid."). Fake: `answerAddPlayersWith(result)`; `sent` grava `linkTokenToCard` `{ tokenId, memberId }`, `unlinkTokenFromCard` `{ tokenId }`, `addPlayers` `{ center }`.
- Menu do token (mestre; `TokenContextMenu.characters = { cast, onConfirmLink }`): `features/tokens/token-link-items.tsx` — no solto, o submenu `menuitem` "Ligar à ficha de…" com um `menuitem` por jogador (nome da conta); ficha sem personagem liga na hora; ficha com personagem abre o `alertdialog` "Ligar à ficha de Bia?" ("Este token passa a usar as barras e condições de Lyra (ficha de Bia).", botões "Cancelar" / "Ligar"; `CardLinkDialog`, na `PlayRoomPage`). No ligado, `menuitem` "Desligar da ficha". Recusa → linha de status. `src/lib/character-link.ts`: `cardLinkTargetsOf(membros, elenco)` e `cardOwnerOf(token, fichas, membros)`.
- Diálogo do token: `TokenDialog.cardOwner` (o `RoomTokenDialog` acha pelo `cardOwnerOf`) → nas abas "Básico" e "Barras" o aviso "Na ficha de Bia · vale em todo grid".
- Barra de ferramentas (mestre): botão "Adicionar jogadores" (`BoardToolbar.members`) manda `token:addPlayers` com `renderer.viewCenterCell()`; centro fora do grid → "Traga o grid para a vista primeiro." sem enviar; pulados → "Davi ainda não tem token." / "Davi e Edu ainda não têm token." (`addPlayersNotice`); ninguém para pôr → "Os jogadores já estão neste grid.".

## Principal e "Na mesa" pela âncora (B8, B10)

- `mainTokenIdOfMember(board, userId)` (e `mainTokenIdOf`): a escolha do grid vence; sem ela, o token do grid ligado à âncora da ficha da pessoa (`characterTokenIdOf`, pelo `board.memberCards`, que já é o do elenco); sem ele, o automático. `MainTokenBoard` exige `memberCards`.
- `tableRosterOf({ members, board, cast, viewerId })`: a ficha vem do `cast.memberCards` (sem elenco, a do board); o token é o principal do grid do grupo e, sem ele, a **âncora** (do elenco) — o card mostra retrato e barras do personagem mesmo fora do grid do grupo. A ficha vazia leva `anchorTokenId: null`.
- `SessionPresencePanel.cast` (o `RoomSidePanel` passa `table.cast`). Card de âncora fora do grid: sem "Achar no mapa" e sem o balão das barras (`useOnGrid` em `player-card-parts.tsx`; o comando iria a um grid onde ela não está).

## Testes

`client/test/lib/{linked-tokens,character-link,main-token,table-roster}.spec.ts`, `client/test/services/{table-cast,token-link-commands,board-events}.spec.ts`, `client/test/stores/{scene-tabs-store,board-reducer}.spec.ts` (describe "the cast"), `client/test/features/tokens/token-link.spec.tsx`, `client/test/features/board/{board-toolbar,board-messages}.spec.ts(x)`, `play-room-page.spec.tsx` (o `token:updated` da âncora muda o PV no canvas), `client/test/features/sessions/player-card.spec.tsx` ("with the cast"). Fixtures `test/support/cast-fixtures.ts` (`VHARN_CAST_ID` = o `castSceneId` do `detailOf`, `CAST_SCENE`, `LYRA_ANCHOR_ID`, `lyraAnchor`, `linkedLyra`, `castBoard`, `VHARN_CAST`, `anchorUpdatedAt(versão, pv)`); `PlayerCardHarness.render({ cast })`.

## Armadilhas

- **Seletor que devolve objeto novo.** Resolver o token ligado num seletor de React (`useBoard(store, (s) => resolve(s.board, …))`) cria objeto a cada leitura e entra em laço de render. A composição mora na store (uma vez por mudança) e é memorizada por identidade.
- **Evento do elenco não pode cair no grid.** Com o `groupSceneId` ainda desconhecido, a visita mandava todo evento ao grupo; o elenco é conferido **antes**, senão a `board-store` do grupo segura o evento em `held`.
