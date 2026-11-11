import { useImperativeHandle } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import { TokenHoverCard } from './token-hover-card';
import { useTokenHover, type TokenHoverRequest } from './use-token-hover';

/** What the room tells the layer: the token the pointer rests on, or `null`. */
export type HoverCardLayerHandle = Readonly<{
  onTokenHover: (request: TokenHoverRequest | null) => void;
}>;

export type HoverCardLayerProps = Readonly<{
  ref: React.Ref<HoverCardLayerHandle>;
  clock: InteractionClock;
  /** The grid shown; `null` while the table opens (no card). */
  board: StoreApi<BoardStore> | null;
  interaction: StoreApi<BoardInteractionStore>;
}>;

/** The card of the hovered token, with its own state: the pointer resting on a token, its delay
 *  and the card render only this layer, never the header, the board or the panel of the room.
 *
 *  Example: `<HoverCardLayer ref={hoverLayer} clock={clock} board={table.board} interaction={interaction} />` */
export function HoverCardLayer(props: HoverCardLayerProps): React.JSX.Element | null {
  const { ref, clock, board, interaction } = props;
  const { hovered, onTokenHover } = useTokenHover(clock);
  useImperativeHandle(ref, () => ({ onTokenHover }), [onTokenHover]);
  if (!hovered || !board) return null;
  return <TokenHoverCard request={hovered} board={board} interaction={interaction} />;
}
