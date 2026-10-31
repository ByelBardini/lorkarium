import type { KeyboardEvent, PointerEvent } from 'react';
import { trackPointerDrag, type DragPoint } from '@/lib/pointer-drag';
import { SHEET_CONSOLE_HEIGHT_MAX, SHEET_CONSOLE_HEIGHT_MIN } from '@/lib/sheet-editor-layout';

/** One arrow press grows or shrinks the console this many pixels. */
export const CONSOLE_HEIGHT_STEP = 24;

export type ConsoleHeightHandleProps = Readonly<{
  /** The console's height, in pixels. */
  height: number;
  onChange: (height: number, remember?: boolean) => void;
  /** The end of a drag: the height is remembered once, not at each move. */
  onDragEnd: () => void;
}>;

const KEY_MOVES: Readonly<Record<string, (height: number) => number>> = {
  ArrowUp: (height) => height + CONSOLE_HEIGHT_STEP,
  ArrowDown: (height) => height - CONSOLE_HEIGHT_STEP,
  Home: () => SHEET_CONSOLE_HEIGHT_MAX,
  End: () => SHEET_CONSOLE_HEIGHT_MIN,
};

/** The edge above the console: dragging it up (or ArrowUp) makes the console taller, down
 *  shorter; Home and End take it to the tallest and the shortest.
 *
 *  Example: `<ConsoleHeightHandle height={192} onChange={setConsoleHeight} onDragEnd={remember} />` */
export function ConsoleHeightHandle(props: ConsoleHeightHandleProps): React.JSX.Element {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const move = KEY_MOVES[event.key];
    if (!move) return;
    event.preventDefault();
    props.onChange(move(props.height));
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label="Altura do console"
      aria-orientation="horizontal"
      aria-valuenow={props.height}
      aria-valuemin={SHEET_CONSOLE_HEIGHT_MIN}
      aria-valuemax={SHEET_CONSOLE_HEIGHT_MAX}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => startDrag(event, props)}
      className="group relative h-1.5 shrink-0 cursor-row-resize touch-none outline-none"
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-divider transition-colors group-hover:bg-primary/60 group-focus-visible:h-0.5 group-focus-visible:bg-primary motion-reduce:transition-none"
      />
    </div>
  );
}

// Measured from where the drag started: the console's bottom stays put, its top follows.
function startDrag(event: PointerEvent<HTMLDivElement>, props: ConsoleHeightHandleProps): void {
  const { clientY: startY } = event;
  const follow = (moved: DragPoint): void =>
    props.onChange(props.height + startY - moved.clientY, false);
  if (trackPointerDrag(event.currentTarget, event, follow, props.onDragEnd)) event.preventDefault();
}
