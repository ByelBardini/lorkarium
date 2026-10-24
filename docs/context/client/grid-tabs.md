# Client · vários grids na sala (abas)

A mesa aberta tem a aba do **grid do grupo** (fixa, segue a ativação) e abas extras que o usuário abriu; cada aba tem board, interação e pilha de desfazer próprias. Contrato do server em [`../board.md`](../board.md) (Abas extras, ativação) e [`../library.md`](../library.md).

## Escopo do comando (`BoardScope`)

- `BoardScope = { campaignId, sceneId }` (`board-command-sender.ts`, reexportado pelo `table-board-commands.ts`). `BoardCommandSender.send(evento, scope, campos)` manda **sempre** o `sceneId` (o server aceitaria sem, mas o client nunca deixa o grid implícito). `SCENE_NOT_FOUND` → falha `scene_not_found` ("Esse grid não está mais aberto pra você.").
- Toda interface de comandos (`TableBoardCommands`, `CombatCommands`, `WallCommands`, `LightCommands`, `EffectAreaCommands`, `MainTokenCommands`, `MemberCardCommands`) recebe `scope` no lugar do `campaignId`.
- `BoardInteractionDeps.scopeOf: () => BoardScope` (e os `*Deps` dos fluxos): lido **a cada envio**, porque o grid do grupo muda com a ativação. `EditContext.scope` (desfazer/colar) é o da aba no momento da tecla (`useEditShortcuts({ scopeOf, … })`).
- Diálogos com comando recebem `scope` (não `campaignId`): `ConfigureSceneDialog`, `TokenDialog`, `TokenImageDialog`, `RoomTokenDialog`, `RoomTokenImageDialog`; a imagem usa `scope.campaignId`.
- O fake `TableBoardCommandsFake.sent` guarda `{ name, campaignId, sceneId, fields }`; fixture `VHARN_GRID` (`table-session-fixtures.ts`) = o escopo do grid do grupo (`VHARN_SCENE`).

## Rede por grid (`table-visit.ts`, `table-session-api.ts`)

- `boardEventShape.sceneId` é **obrigatório** (contracts): evento sem `sceneId` = `invalid` (resync).
- `TableSessionHandle.watch(sceneId, listener)` → `GridWatchHandle { close, resync }`: emite `scene:watch` (depois do join e do sync do grupo, ou na hora se já juntou) e entrega `board`/`boardFailed` (`SCENE_NOT_FOUND` → `not_found`) ao listener da aba; `close()` emite `scene:unwatch`; a cada reconexão: `session:join` → `board:sync` → cada `scene:watch`. `GridUpdate` = `board | boardEvent | tokensDragged | boardFailed`.
- Roteamento: a visita guarda o `groupSceneId` (do snapshot do grupo e de cada `scene:activated`). Evento de um grid vai ao listener da mesa se é do grupo (ou se o grupo ainda não é conhecido) e à aba daquele grid se está aberta. `token:draggedMany` sem `sceneId` é do grupo. Evento inválido ressincroniza a aba do `sceneId` dele, senão o grupo.
- Elenco (B7): `followCast(castSceneId, listener)` → `CastHandle { resync }`, só `board:sync` (nunca `scene:watch`), depois do sync do grupo; evento do elenco vai só a ele (ver [`characters.md`](characters.md)). A `scene-tabs-store` (`deps.cast`) faz `relink()` de toda aba quando o elenco muda.
- Da mesa: `{ kind: 'sceneActivated', event }` (a visita troca o `groupSceneId` e pede `board:sync` sozinha), `{ kind: 'sceneClosed', event }` (a visita esquece a aba: sem `unwatch` nem novo `watch` na reconexão) e `{ kind: 'libraryChanged', event }`.
- `board-store.ts`: evento de **outro grid** (depois do snapshot) fica em `held` sem pedir resync; o snapshot reaplica só os `held` do grid dele (o grupo indo para outro grid). Arraste com `sceneId` de outro grid é ignorado.

## Estado (`src/stores/scene-tabs-store.ts`, `scene-tabs-storage.ts`)

- `createSceneTabsStore({ campaignId, groupBoard, cast, watch, storage, createInteraction })`, **uma por mesa aberta** (criada pela `open-tables-store`; `OpenTable.tabs`). `OpenTable.board`/`edits` continuam sendo os da aba do grupo.
- Estado `{ campaignId, tabs: SceneTab[] (o grupo primeiro), visibleKey, notice, libraryRevision }`; `SceneTab = { key (GROUP_TAB = 'group' ou o sceneId), board, interaction, edits, scopeOf }`. Ações: `open(sceneId)` (abre ou só mostra; o grid do grupo mostra a aba do grupo), `show(key)`, `close(sceneId)` (a do grupo nunca fecha), `apply(update)`, `dismissNotice`, `restore()` (depois do F5), `dispose(forget)`.
- Seletores: `visibleTabOf(estado)`, `groupTabOf(estado)`; hook `useSceneTabOf(store | null, seletor)` (`null` enquanto a mesa abre) e `useSceneTabs(store, seletor)`.
- `scene:activated` → a aba extra daquele grid fecha (seria o mesmo board duas vezes), a do grupo fica visível e, quando o snapshot do grupo nomeia o grid novo, `notice` = "O mestre levou o grupo para Estrada de Vharn.". `scene:closed` → fecha a aba com "Torre ficou privada." / "Torre foi excluída.". Aba cujo `watch` volta `not_found` fecha calada (a recusada do F5). `library:changed` → `libraryRevision + 1` (a biblioteca aberta se relê por ele, ver [`library.md`](library.md)).
- Abas lembradas no `sessionStorage` em `lorkarium.sceneTabs.<campaignId>` = `{ sceneIds, visible }` (schema Zod local; storage que lança cai na memória); fechar a mesa (`close`/`closeAll`) esquece, sessão recusada (`suspendAll`) guarda.
- A interação de cada aba vem do `OpenTablesDeps.createInteraction` (`CreateTabInteraction`), montado por `tabInteractionFactory(commands)` (`src/features/board/tab-interaction.ts`: os comandos da sala + `tokenCommandFailureMessage`) no `main.tsx` e no `testDependencies()`; fora dele, `tabInteractions()` (`test/support/tab-interactions.ts`).
- `table-edit-store.ts`: `createCopyArea()` = a área de cópia **da mesa**; `createTableEditStore(campaignId, copyArea)` = a pilha **da aba**, com `copied` espelhando a área (copiar num grid, colar no outro).

## Sala (`src/features/board/`)

- `scene-tabs.tsx` — `SceneTabs({ tabs })`: `tablist` "Grids abertos" no topo; a aba do grupo primeiro com o selo "Grupo" (texto em caixa alta) e sem fechar; as extras com "Fechar Torre". Foco móvel (só a aba visível no Tab; setas andam, Enter mostra); nome do grid pelo board da aba ("Carregando…" antes do snapshot); o aviso das abas num `role="status"` "Aviso dos grids" sempre montado.
- `room-header.tsx` — o topo tem as abas (`tabs`) e o link "Biblioteca" (`/campaigns/:id/table/library`, o modal da [`library.md`](library.md)); o `TurnLine` é o da aba visível.
- `play-room-page.tsx` — `useShownTab(campaignId, opened, commands)`: canvas (`BoardArea` com `key` da aba, remonta ao trocar), ferramentas, menus, diálogos, tracker, rodapé do token e `TurnLine` usam o board, a interação e a pilha da aba visível; até a mesa abrir, uma interação em branco. "Na mesa" (`RoomSidePanel.group`) fica no board e na interação da aba do grupo.
- `use-open-table.ts` devolve também `tabs` (`null` enquanto a mesa não abriu de fato).

## Testes

`client/test/services/{board-command-sender,table-scene-watch,board-events,library-api,http-transport}.spec.ts`, `client/test/stores/{scene-tabs-store,board-store}.spec.ts`, `client/test/features/board/{scene-tabs,play-room-page-tabs}.spec.tsx`. Apoio: `scene-tab-fixtures.ts` (`TORRE_SCENE`, `ESTRADA_SCENE`, `TORRE_GRID`, `torreBoard`, `estradaBoard`, `sceneActivated`, `sceneClosed`, `libraryChanged`), `scene-tabs-harness.ts` (`openVharnTabs(api, storage?, commands?)`, `openTorreTab(api, table)`), `library-fixtures.ts` (`ATO_1`, `CATACUMBAS`, `libraryScene`, `vharnLibrary`); `TableSessionApiFake` tem `watched`, `unwatched`, `watchResyncs` e `emitToGrid(sceneId, …)`.
