import type { WallKindDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import type { WallStyleStore } from '@/stores/wall-style-store';
import { WallPanel } from './wall-panel';

export type RoomWallPanelProps = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  wallStyle: StoreApi<WallStyleStore>;
}>;

/** The walls panel of the room: the action goes to the board; with walls selected, a kind changes them (one command, on the
 *  undo stack); with none, it is the style of the next wall.
 *
 *  Example: `<RoomWallPanel board={table.board} interaction={interaction} wallStyle={deps.wallStyle} />` */
export function RoomWallPanel({
  board,
  interaction,
  wallStyle,
}: RoomWallPanelProps): React.JSX.Element {
  const selectedIds = useBoardInteraction(interaction, (state) => state.selectedWallIds);
  const mode = useBoardInteraction(interaction, (state) => state.wallMode);
  const changeSelected = (kind: WallKindDto): void => {
    const walls = (board.getState().board?.walls ?? []).filter(({ id }) =>
      selectedIds.includes(id),
    );
    void interaction.getState().changeWallKinds(walls, kind);
  };
  return (
    <WallPanel
      wallStyle={wallStyle}
      onKind={selectedIds.length > 0 ? changeSelected : undefined}
      mode={mode}
      onMode={interaction.getState().setWallMode}
    />
  );
}
