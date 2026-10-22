import { useCallback, useEffect, useRef, useState } from 'react';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { ScreenRect } from '@/renderer/board-renderer';

/** The token the pointer rests on, and where it is drawn in viewport px. */
export type TokenHoverRequest = Readonly<{ tokenId: string; rect: ScreenRect }>;

// Long enough that sweeping the pointer across the board does not flash cards.
const HOVER_DELAY_MS = 300;

/** The card of the hovered token: it shows after the pointer rests 300 ms on a token, and closes
 *  at once when the pointer leaves it (or anything else says `null`: a drag, the token menu).
 *
 *  Example: `const hover = useTokenHover(clock); <BoardArea onTokenHover={hover.onTokenHover} />` */
export function useTokenHover(clock: InteractionClock): Readonly<{
  hovered: TokenHoverRequest | null;
  onTokenHover: (request: TokenHoverRequest | null) => void;
}> {
  const [hovered, setHovered] = useState<TokenHoverRequest | null>(null);
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => () => pending.current?.(), []);
  const onTokenHover = useCallback(
    (request: TokenHoverRequest | null) => {
      pending.current?.();
      pending.current = null;
      setHovered(null);
      if (!request) return;
      pending.current = clock.after(HOVER_DELAY_MS, () => {
        pending.current = null;
        setHovered(request);
      });
    },
    [clock],
  );
  return { hovered, onTokenHover };
}
