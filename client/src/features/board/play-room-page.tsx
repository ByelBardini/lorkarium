import type { CampaignDetailDto } from '@lorkarium/contracts';
import { useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useOpenTable } from '@/features/sessions/use-open-table';
import { TurnLine } from '@/features/combat/turn-line';
import { RoomTokenDialog } from '@/features/tokens/room-token-dialog';
import type { BoardRenderer, CreateBoardRenderer } from '@/renderer/board-renderer';
import type { Clipboard } from '@/services/clipboard';
import type { TableBoardCommands } from '@/services/table-board-commands';
import { createBoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import type { OpenTablesStore } from '@/stores/open-tables-store';
import { useRoomLayout, type RoomLayoutStore } from '@/stores/room-layout-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { BoardArea } from './board-area';
import { tokenCommandFailureMessage } from './board-messages';
import { BoardStatusLine } from './board-status-line';
import { BoardToolbar } from './board-toolbar';
import { ConfigureGridDialog } from './configure-grid-dialog';
import { FocusToggle } from './focus-toggle';
import { RoomHeader } from './room-header';
import { RoomSidePanel } from './room-panel';
import { useInteractionFollowsTable } from './use-interaction-follows-table';
import { useRoomShortcuts } from './use-room-shortcuts';

export type PlayRoomPageProps = Readonly<{
  campaign: CampaignDetailDto;
  openTables: StoreApi<OpenTablesStore>;
  roomLayout: StoreApi<RoomLayoutStore>;
  clipboard: Clipboard;
  createBoardRenderer: CreateBoardRenderer;
  boardCommands: TableBoardCommands;
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
    }),
  );
  const [renderer, setRenderer] = useState<BoardRenderer | null>(null);
  const [gridDialog, setGridDialog] = useState(false);
  // `{ tokenId: null }` is "Novo token"; a token id is "Editar token".
  const [tokenDialog, setTokenDialog] = useState<Readonly<{ tokenId: string | null }> | null>(null);
  const focus = useRoomLayout(roomLayout, (state) => state.focus);
  useRoomShortcuts({ roomLayout, interaction });
  const table = view.kind === 'open' ? view : null;
  useInteractionFollowsTable(table, interaction);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
      <title>{`Lorkarium · ${campaign.name}`}</title>
      {!focus && (
        <RoomHeader
          campaign={campaign}
          presence={table?.presence ?? null}
          board={table?.board ?? null}
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
        />
        <BoardStatusLine table={table} interaction={interaction} />
        <FocusToggle roomLayout={roomLayout} />
        {focus && table && (
          <TurnLine
            board={table.board}
            className="absolute top-3 left-1/2 -translate-x-1/2 bg-panel px-3 py-1"
          />
        )}
        {!focus && (
          <BoardToolbar
            interaction={interaction}
            renderer={renderer}
            canConfigure={campaign.myRole === 'master'}
            onConfigure={() => setGridDialog(true)}
            onNewToken={() => setTokenDialog({ tokenId: null })}
          />
        )}
        {gridDialog && table && (
          <RoomGridDialog
            campaignId={campaign.id}
            table={table}
            commands={props.boardCommands}
            onClose={() => setGridDialog(false)}
          />
        )}
        {tokenDialog && table && (
          <RoomTokenDialog
            campaignId={campaign.id}
            table={table}
            tokenId={tokenDialog.tokenId}
            renderer={renderer}
            commands={props.boardCommands}
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

type RoomGridDialogProps = Readonly<{
  campaignId: string;
  table: Readonly<{ presence: StoreApi<TablePresenceStore>; board: StoreApi<BoardStore> }>;
  commands: TableBoardCommands;
  onClose: () => void;
}>;

// "Configurar grid" over the confirmed scene; while reconnecting it opens but cannot send.
function RoomGridDialog({ campaignId, table, commands, onClose }: RoomGridDialogProps) {
  const scene = useBoard(table.board, (state) => state.board?.scene ?? null);
  const live = useTablePresence(table.presence, (state) => state.status === 'live');
  if (!scene) return null;
  return (
    <ConfigureGridDialog
      campaignId={campaignId}
      scene={scene}
      commands={commands}
      connected={live}
      onClose={onClose}
    />
  );
}
