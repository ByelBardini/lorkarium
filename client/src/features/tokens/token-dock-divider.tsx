import type { KeyboardEvent, PointerEvent } from 'react';
import { trackPointerDrag, type DragPoint } from '@/lib/pointer-drag';
import { TOKEN_DOCK_HEIGHT_STEP, TOKEN_DOCK_MIN_HEIGHT } from '@/lib/token-dock-prefs';

export type TokenDockDividerProps = Readonly<{
  /** The dock's height as drawn now, in pixels. */
  height: number;
  /** The tallest the dock can get in this panel (the tracker keeps its minimum). */
  maxHeight: number;
  /** A new height asked for (by a drag or a key), before it is fitted to the panel. */
  onChange: (height: number) => void;
  /** Double click: the dock goes back to its natural height. */
  onReset: () => void;
}>;

const KEY_MOVES: Readonly<Record<string, (props: TokenDockDividerProps) => number>> = {
  ArrowUp: ({ height }) => height + TOKEN_DOCK_HEIGHT_STEP,
  ArrowDown: ({ height }) => height - TOKEN_DOCK_HEIGHT_STEP,
  Home: ({ maxHeight }) => maxHeight,
  End: () => TOKEN_DOCK_MIN_HEIGHT,
};

/** The edge between the tracker and the token's detail: dragging it up (or ArrowUp) gives the
 *  detail more room, down gives it to the tracker; Home and End take it to the tallest and the
 *  lowest, a double click back to the natural height.
 *
 *  Example: `<TokenDockDivider height={240} maxHeight={480} onChange={resize} onReset={reset} />` */
export function TokenDockDivider(props: TokenDockDividerProps): React.JSX.Element {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const move = KEY_MOVES[event.key];
    if (!move) return;
    event.preventDefault();
    props.onChange(move(props));
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label="Altura da ficha do token"
      aria-orientation="horizontal"
      aria-valuenow={props.height}
      aria-valuemin={TOKEN_DOCK_MIN_HEIGHT}
      aria-valuemax={props.maxHeight}
      title="Arraste para dividir o espaço; duplo clique volta ao padrão"
      onKeyDown={onKeyDown}
      onDoubleClick={props.onReset}
      onPointerDown={(event) => startDrag(event, props)}
      className="group relative -mx-1 h-3 shrink-0 cursor-row-resize touch-none outline-none"
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-border transition-colors group-hover:bg-primary/60 group-focus-visible:h-0.5 group-focus-visible:bg-primary motion-reduce:transition-none"
      />
    </div>
  );
}

// Measured from where the drag started: the dock's bottom stays put, its top follows.
function startDrag(event: PointerEvent<HTMLDivElement>, props: TokenDockDividerProps): void {
  const { clientY: startY } = event;
  const follow = (moved: DragPoint): void => props.onChange(props.height + startY - moved.clientY);
  if (trackPointerDrag(event.currentTarget, event, follow, () => undefined)) event.preventDefault();
}
