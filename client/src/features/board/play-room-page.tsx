import type { CampaignDetailDto } from '@lorkarium/contracts';
import { useEffect, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useOpenTable } from '@/features/sessions/use-open-table';
import { ApplyConditionDialog } from '@/features/combat/apply-condition-dialog';
import { TurnLine } from '@/features/combat/turn-line';
import { RoomTokenDialog, RoomTokenImageDialog } from '@/features/tokens/room-token-dialog';
import type { BoardRenderer, CreateBoardRenderer } from '@/renderer/board-renderer';
import type { AssetsApi } from '@/services/assets-api';
import type { Clipboard } from '@/services/clipboard';
import type { TableBoardCommands } from '@/services/table-board-commands';
import { DrawStylePanel } from '@/features/drawings/draw-style-panel';
import { EffectAreaPanel } from '@/features/effect-areas/effect-area-panel';
import { RoomWallPanel } from '@/features/walls/room-wall-panel';
import { RoomLightPanel } from '@/features/lights/room-light-panel';
import { DoorMenu, type DoorMenuRequest } from '@/features/walls/door-menu';
import { LightMenu, type LightMenuRequest } from '@/features/lights/light-menu';
import type { EditEntry } from '@/lib/edit-history';
import { createBoardInteractionStore, useBoardInteraction } from '@/stores/board-interaction-store';
import type { DrawingStyleStore } from '@/stores/drawing-style-store';
import type { EffectAreaStyleStore } from '@/stores/effect-area-style-store';
import type { WallStyleStore } from '@/stores/wall-style-store';
import type { LightColorStore } from '@/stores/light-color-store';
import type { LightReachStore } from '@/stores/light-reach-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import type { OpenTablesStore } from '@/stores/open-tables-store';
import { useRoomLayout, type RoomLayoutStore } from '@/stores/room-layout-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { BoardArea } from './board-area';
import { DeleteSelectionDialog, type SelectionToDelete } from './delete-selection-dialog';
import { tokenCommandFailureMessage } from './board-messages';
import { BoardStatusLine } from './board-status-line';
import { BoardToolbar, type BoardToolbarProps } from './board-toolbar';
import { ConfigureSceneDialog } from './configure-scene-dialog';
import { FocusToggle } from './focus-toggle';
import { TokenContextMenu, type TokenMenuRequest } from './token-context-menu';
import { RoomHeader } from './room-header';
import { RoomSidePanel } from './room-panel';
import { useInteractionFollowsTable } from './use-interaction-follows-table';
import { useEditShortcuts } from './use-edit-shortcuts';
import { useRoomShortcuts } from './use-room-shortcuts';

export type PlayRoomPageProps = Readonly<{
  campaign: CampaignDetailDto;
  openTables: StoreApi<OpenTablesStore>;
  roomLayout: StoreApi<RoomLayoutStore>;
  drawingStyle: StoreApi<DrawingStyleStore>;
  effectAreaStyle: StoreApi<EffectAreaStyleStore>;
  wallStyle: StoreApi<WallStyleStore>;
  lightReach: StoreApi<LightReachStore>;
  lightColor: StoreApi<LightColorStore>;
  clipboard: Clipboard;
  createBoardRenderer: CreateBoardRenderer;
  boardCommands: TableBoardCommands;
  assets: AssetsApi;
}>;

/** The play room: the board fills the screen, the top bar, tools and panel float over it, and
 *  focus mode (F, Esc) leaves the board alone. Opens the table among the tab's open tables.
 *
 *  Example: `<PlayRoomPage key={campaign.id} campaign={campaign} openTables={deps.openTables} roomLayout={deps.roomLayout} clipboard={deps.clipboard} createBoardRenderer={deps.createBoardRenderer} />` */
export function PlayRoomPage(props: PlayRoomPageProps): React.JSX.Element {
  const { campaign, openTables, roomLayout, clipboard } = props;
  const view = useOpenTable(campaign, openTables);
  const [interaction] = useState(() =>
    createBoardInteractionStore({
      campaignId: campaign.id,
      commands: props.boardCommands,
      describeRefusal: tokenCommandFailureMessage,
      ...undoStackOf(openTables, campaign.id),
    }),
  );
  const [renderer, setRenderer] = useState<BoardRenderer | null>(null);
  const [sceneDialog, setSceneDialog] = useState(false);
  // `{ tokenId: null }` is "Novo token"; a token id is "Editar token".
  const [tokenDialog, setTokenDialog] = useState<Readonly<{ tokenId: string | null }> | null>(null);
  const [tokenMenu, setTokenMenu] = useState<TokenMenuRequest | null>(null);
  const [doorMenu, setDoorMenu] = useState<DoorMenuRequest | null>(null);
  const [lightMenu, setLightMenu] = useState<LightMenuRequest | null>(null);
  const [conditionTargets, setConditionTargets] = useState<readonly string[] | null>(null);
  const [imageTokenId, setImageTokenId] = useState<string | null>(null);
  const [deletion, setDeletion] = useState<SelectionToDelete | null>(null);
  const isMaster = campaign.myRole === 'master';
  useEffect(() => interaction.getState().allowLayerChoice(isMaster), [interaction, isMaster]);
  const focus = useRoomLayout(roomLayout, (state) => state.focus);
  useRoomShortcuts({ roomLayout, interaction });
  const table = view.kind === 'open' ? view : null;
  useInteractionFollowsTable(table, interaction);
  const commands = props.boardCommands;
  useEditShortcuts({ campaignId: campaign.id, table, interaction, commands, isMaster });
  const tool = useBoardInteraction(interaction, (state) => state.tool);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
      <title>{`Lorkarium · ${campaign.name}`}</title>
      {!focus && (
        <RoomHeader
          campaign={campaign}
          presence={table?.presence ?? null}
          board={table?.board ?? null}
          interaction={interaction}
          openTables={openTables}
          roomLayout={roomLayout}
          clipboard={clipboard}
        />
      )}
      <div className="relative min-h-0 flex-1">
        <BoardArea
          view={view}
          interaction={interaction}
          createBoardRenderer={props.createBoardRenderer}
          onRenderer={setRenderer}
          onOpenToken={(tokenId) => {
            interaction.getState().select(tokenId);
            roomLayout.getState().showTab('combat');
          }}
          onDeleteSelection={setDeletion}
          onTokenMenu={setTokenMenu}
          onDoorMenu={(request) => isMaster && setDoorMenu(request)}
          onLightMenu={(request) => isMaster && setLightMenu(request)}
          drawingStyle={props.drawingStyle}
          effectAreaStyle={props.effectAreaStyle}
          wallStyle={props.wallStyle}
          lightReach={props.lightReach}
          lightColor={props.lightColor}
        />
        {tool === 'draw' && !focus && <DrawStylePanel drawingStyle={props.drawingStyle} />}
        {tool === 'area' && !focus && <EffectAreaPanel effectAreaStyle={props.effectAreaStyle} />}
        {tool === 'walls' && !focus && table && (
          <RoomWallPanel
            board={table.board}
            interaction={interaction}
            wallStyle={props.wallStyle}
          />
        )}
        {tool === 'lights' && !focus && table && (
          <RoomLightPanel
            board={table.board}
            interaction={interaction}
            lightReach={props.lightReach}
            lightColor={props.lightColor}
          />
        )}
        {tokenMenu && table && (
          <TokenContextMenu
            request={tokenMenu}
            board={table.board}
            interaction={interaction}
            onApplyCondition={setConditionTargets}
            onChangeImage={setImageTokenId}
            onClose={() => setTokenMenu(null)}
          />
        )}
        {doorMenu && table && (
          <DoorMenu
            request={doorMenu}
            board={table.board}
            interaction={interaction}
            onClose={() => setDoorMenu(null)}
          />
        )}
        {lightMenu && table && (
          <LightMenu
            request={lightMenu}
            board={table.board}
            interaction={interaction}
            onClose={() => setLightMenu(null)}
          />
        )}
        {conditionTargets && table && (
          <ApplyConditionDialog
            tokenIds={conditionTargets}
            board={table.board}
            interaction={interaction}
            isMaster={isMaster}
            onClose={() => setConditionTargets(null)}
          />
        )}
        {imageTokenId && table && (
          <RoomTokenImageDialog
            campaignId={campaign.id}
            board={table.board}
            tokenId={imageTokenId}
            commands={props.boardCommands}
            assets={props.assets}
            onClose={() => setImageTokenId(null)}
          />
        )}
        {deletion && (
          <DeleteSelectionDialog
            selection={deletion}
            interaction={interaction}
            onClose={() => setDeletion(null)}
          />
        )}
        <BoardStatusLine table={table} interaction={interaction} />
        <FocusToggle roomLayout={roomLayout} />
        {focus && table && (
          <TurnLine
            board={table.board}
            interaction={interaction}
            className="absolute top-3 left-1/2 -translate-x-1/2 bg-panel px-3 py-1"
          />
        )}
        {!focus && (
          <RoomToolbar
            board={table?.board ?? null}
            interaction={interaction}
            renderer={renderer}
            canConfigure={campaign.myRole === 'master'}
            onConfigure={() => setSceneDialog(true)}
            onNewToken={() => setTokenDialog({ tokenId: null })}
          />
        )}
        {sceneDialog && table && (
          <RoomSceneDialog
            campaignId={campaign.id}
            table={table}
            commands={props.boardCommands}
            assets={props.assets}
            onClose={() => setSceneDialog(false)}
          />
        )}
        {tokenDialog && table && (
          <RoomTokenDialog
            campaignId={campaign.id}
            table={table}
            tokenId={tokenDialog.tokenId}
            renderer={renderer}
            interaction={interaction}
            commands={props.boardCommands}
            assets={props.assets}
            onClose={() => setTokenDialog(null)}
          />
        )}
        {!focus && (
          <RoomSidePanel
            roomLayout={roomLayout}
            table={table}
            interaction={interaction}
            isMaster={campaign.myRole === 'master'}
            onEditToken={(tokenId) => setTokenDialog({ tokenId })}
          />
        )}
      </div>
    </div>
  );
}

// The open table's undo stack and its confirmed cells, read when a move is confirmed (the table
// opens after the room's first render, so it is looked up then, not captured now).
function undoStackOf(
  openTables: StoreApi<OpenTablesStore>,
  campaignId: string,
): Readonly<{
  recordEdit: (entry: EditEntry) => void;
  tokenCellOf: (tokenId: string) => Readonly<{ col: number; row: number }> | null;
}> {
  const tableOf = () =>
    openTables.getState().tables.find((table) => table.campaignId === campaignId);
  return {
    recordEdit: (entry) => tableOf()?.edits.getState().record(entry),
    tokenCellOf: (tokenId) => {
      const token = tableOf()
        ?.board.getState()
        .board?.tokens.find(({ id }) => id === tokenId);
      return token ? { col: token.col, row: token.row } : null;
    },
  };
}

type RoomSceneDialogProps = Readonly<{
  campaignId: string;
  table: Readonly<{ presence: StoreApi<TablePresenceStore>; board: StoreApi<BoardStore> }>;
  commands: TableBoardCommands;
  assets: AssetsApi;
  onClose: () => void;
}>;

// "Configurar cena" over the confirmed scene; while reconnecting it opens but cannot send.
function RoomSceneDialog({ campaignId, table, commands, assets, onClose }: RoomSceneDialogProps) {
  const scene = useBoard(table.board, (state) => state.board?.scene ?? null);
  const live = useTablePresence(table.presence, (state) => state.status === 'live');
  if (!scene) return null;
  return (
    <ConfigureSceneDialog
      campaignId={campaignId}
      scene={scene}
      commands={commands}
      assets={assets}
      connected={live}
      onClose={onClose}
    />
  );
}

type RoomToolbarProps = Omit<BoardToolbarProps, 'sightOn'> &
  Readonly<{ board: StoreApi<BoardStore> | null }>;

// The toolbar before the table opens has no scene to preview; once it does, Escuro and Luz do dia
// give the master "Ver como os selecionados".
function RoomToolbar({ board, ...toolbar }: RoomToolbarProps): React.JSX.Element {
  if (!board) return <BoardToolbar {...toolbar} />;
  return <TableToolbar board={board} {...toolbar} />;
}

function TableToolbar({
  board,
  ...toolbar
}: Omit<BoardToolbarProps, 'sightOn'> & Readonly<{ board: StoreApi<BoardStore> }>) {
  const vision = useBoard(board, (state) => state.board?.scene.vision);
  return <BoardToolbar {...toolbar} sightOn={vision === 'dark' || vision === 'daylight'} />;
}
