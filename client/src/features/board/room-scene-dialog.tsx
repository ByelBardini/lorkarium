import type { StoreApi } from 'zustand/vanilla';
import type { AssetsApi } from '@/services/assets-api';
import type { TableBoardCommands } from '@/services/table-board-commands';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { ConfigureSceneDialog } from './configure-scene-dialog';

export type RoomSceneDialogProps = Readonly<{
  campaignId: string;
  table: Readonly<{ presence: StoreApi<TablePresenceStore>; board: StoreApi<BoardStore> }>;
  commands: TableBoardCommands;
  assets: AssetsApi;
  onClose: () => void;
}>;

/** "Configurar cena" over the confirmed scene of the tab shown; while reconnecting it opens but
 *  cannot send.
 *
 *  Example: `<RoomSceneDialog campaignId={campaign.id} table={table} commands={commands} assets={assets} onClose={close} />` */
export function RoomSceneDialog({
  campaignId,
  table,
  commands,
  assets,
  onClose,
}: RoomSceneDialogProps): React.JSX.Element | null {
  const scene = useBoard(table.board, (state) => state.board?.scene ?? null);
  const live = useTablePresence(table.presence, (state) => state.status === 'live');
  if (!scene) return null;
  return (
    <ConfigureSceneDialog
      scope={{ campaignId, sceneId: scene.id }}
      scene={scene}
      commands={commands}
      assets={assets}
      connected={live}
      onClose={onClose}
    />
  );
}
