import type { MemberCardDto } from '@lorkarium/contracts';
import { cell } from '@lorkarium/game-core';
import { useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { cardOwnerOf } from '@/lib/character-link';
import type { BoardRenderer } from '@/renderer/board-renderer';
import type { AssetsApi } from '@/services/assets-api';
import type { TableBoardCommands, BoardScope } from '@/services/table-board-commands';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { TokenAuraDialog } from './token-aura-dialog';
import { TokenDialog } from './token-dialog';
import { TokenImageDialog } from './token-image-dialog';
import type { TokenPlayer } from './token-form-state';

const NO_CARDS: MemberCardDto[] = [];

export type RoomTokenDialogProps = Readonly<{
  scope: BoardScope;
  table: Readonly<{ presence: StoreApi<TablePresenceStore>; board: StoreApi<BoardStore> }>;
  /** `null` for "Novo token". */
  tokenId: string | null;
  renderer: BoardRenderer | null;
  /** A new token lands on the master's active layer. */
  interaction: StoreApi<BoardInteractionStore>;
  commands: TableBoardCommands;
  assets: AssetsApi;
  onClose: () => void;
}>;

/** The token dialog over the confirmed board: the players of the table can control it, and a
 *  new token goes to the cell at the center of the view, on the active layer.
 *
 *  Example: `{dialog && <RoomTokenDialog scope={scope} table={table} tokenId={null} renderer={renderer} commands={commands} onClose={close} />}` */
export function RoomTokenDialog(props: RoomTokenDialogProps): React.JSX.Element | null {
  const { table, tokenId } = props;
  const token = useBoard(table.board, (state) =>
    tokenId ? (state.board?.tokens.find(({ id }) => id === tokenId) ?? null) : null,
  );
  const members = useTablePresence(table.presence, (state) => state.members);
  const cards = useBoard(table.board, (state) => state.board?.memberCards ?? NO_CARDS);
  const cellDistance = useBoard(table.board, (state) => state.board?.scene.cellDistance ?? 1.5);
  const cellUnit = useBoard(table.board, (state) => state.board?.scene.cellUnit ?? 'm');
  const live = useTablePresence(table.presence, (state) => state.status === 'live');
  const [placeAt] = useState(() => props.renderer?.viewCenterCell() ?? cell(0, 0));
  const [layer] = useState(() => props.interaction.getState().activeLayer);
  if (tokenId && !token) return null;
  const players: TokenPlayer[] = members
    .filter(({ role }) => role === 'player')
    .map(({ userId, name }) => ({ userId, name }));
  return (
    <TokenDialog
      scope={props.scope}
      token={token}
      placeAt={placeAt}
      layer={layer}
      players={players}
      commands={props.commands}
      assets={props.assets}
      distance={{ cellDistance, cellUnit }}
      connected={live}
      cardOwner={token && cardOwnerOf(token, cards, members)}
      onClose={props.onClose}
    />
  );
}

export type RoomTokenImageDialogProps = Readonly<{
  scope: BoardScope;
  board: StoreApi<BoardStore>;
  tokenId: string;
  commands: TableBoardCommands;
  assets: AssetsApi;
  onClose: () => void;
}>;

/** "Imagem…" of the right-click menu, over the confirmed token (gone, it closes itself).
 *
 *  Example: `{imageTokenId && <RoomTokenImageDialog scope={scope} board={board} tokenId={imageTokenId} commands={commands} assets={assets} onClose={close} />}` */
export function RoomTokenImageDialog(props: RoomTokenImageDialogProps): React.JSX.Element | null {
  const { board, tokenId, ...rest } = props;
  const token = useBoard(board, (state) => state.board?.tokens.find(({ id }) => id === tokenId));
  return token ? <TokenImageDialog token={token} {...rest} /> : null;
}

/** "Aura…" of the right-click menu, over the confirmed token (gone, it closes itself); the radius
 *  is typed in the unit of the scene.
 *
 *  Example: `{auraTokenId && <RoomTokenAuraDialog scope={scope} board={board} tokenId={auraTokenId} commands={commands} assets={assets} onClose={close} />}` */
export function RoomTokenAuraDialog(props: RoomTokenImageDialogProps): React.JSX.Element | null {
  const { board, tokenId, ...rest } = props;
  const token = useBoard(board, (state) => state.board?.tokens.find(({ id }) => id === tokenId));
  const cellDistance = useBoard(board, (state) => state.board?.scene.cellDistance ?? 1.5);
  const cellUnit = useBoard(board, (state) => state.board?.scene.cellUnit ?? 'm');
  if (!token) return null;
  return <TokenAuraDialog token={token} distance={{ cellDistance, cellUnit }} {...rest} />;
}
