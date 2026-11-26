import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import {
  clampTokenDockHeight,
  TOKEN_DOCK_MIN_HEIGHT,
  TOKEN_TRACKER_MIN_HEIGHT,
} from '@/lib/token-dock-prefs';
import { cn } from '@/lib/utils';
import type { BoardStore } from '@/stores/board-store';
import { useRoomLayout, type RoomLayoutStore } from '@/stores/room-layout-store';
import { TokenDockDivider } from './token-dock-divider';
import { useTokenDockPrefsKey } from './use-token-dock-prefs-key';

export type TokenDockFrameProps = Readonly<{
  board: StoreApi<BoardStore>;
  roomLayout: StoreApi<RoomLayoutStore>;
  /** Collapsed, the dock is only its head: no divider, its natural height. */
  resizable: boolean;
  children: ReactNode;
}>;

const BIGGEST = Number.MAX_SAFE_INTEGER;

/** The dock's box at the foot of "Combate": with `resizable`, a divider on top sets its height
 *  (remembered per account and table); untouched, its natural height up to 45% of the panel.
 *
 *  Example: `<TokenDockFrame board={board} roomLayout={roomLayout} resizable>{detail}</TokenDockFrame>` */
export function TokenDockFrame(props: TokenDockFrameProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const key = useTokenDockPrefsKey(props.board);
  const stored = useRoomLayout(props.roomLayout, (state) =>
    key ? state.tokenDockPrefsOf(key).height : null,
  );
  const measured = useMeasuredHeights(ref);
  const setHeight = (height: number | null): void => {
    if (key) props.roomLayout.getState().setTokenDockHeight(key, height);
  };
  const height = stored === null ? measured.dock : clampTokenDockHeight(stored, measured.panel);
  return (
    <div
      ref={ref}
      className={cn('flex min-h-0 shrink-0 flex-col', stored === null && 'max-h-[45%]')}
      style={props.resizable && stored !== null ? fixedHeightStyle(stored) : undefined}
    >
      {props.resizable && (
        <TokenDockDivider
          height={height}
          maxHeight={clampTokenDockHeight(BIGGEST, measured.panel)}
          onChange={(asked) => setHeight(clampTokenDockHeight(asked, panelHeightOf(ref.current)))}
          onReset={() => setHeight(null)}
        />
      )}
      {props.children}
    </div>
  );
}

// The CSS keeps the bounds while the panel resizes, without measuring at every frame.
function fixedHeightStyle(height: number): React.CSSProperties {
  return {
    height,
    minHeight: TOKEN_DOCK_MIN_HEIGHT,
    maxHeight: `calc(100% - ${TOKEN_TRACKER_MIN_HEIGHT}px)`,
  };
}

function panelHeightOf(frame: HTMLElement | null): number {
  return frame?.parentElement?.clientHeight ?? 0;
}

type MeasuredHeights = Readonly<{ dock: number; panel: number }>;

// Followed as the dock and the panel resize: the divider says the height drawn, and a keypress
// starts from it.
function useMeasuredHeights(ref: React.RefObject<HTMLElement | null>): MeasuredHeights {
  const [dock, setDock] = useState(0);
  const [panel, setPanel] = useState(0);
  useLayoutEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const measure = (): void => {
      setDock(frame.offsetHeight);
      setPanel(panelHeightOf(frame));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    if (frame.parentElement) observer.observe(frame.parentElement);
    return () => observer.disconnect();
  }, [ref]);
  return { dock, panel };
}
