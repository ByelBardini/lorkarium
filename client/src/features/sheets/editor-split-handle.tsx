import type { KeyboardEvent, PointerEvent } from 'react';
import {
  SHEET_EDITOR_CODE_SHARE_MAX,
  SHEET_EDITOR_CODE_SHARE_MIN,
} from '@/lib/sheet-editor-layout';
import { trackPointerDrag, type DragPoint } from '@/lib/pointer-drag';
import { cn } from '@/lib/utils';

/** One arrow press moves the divider this many percent. */
export const EDITOR_SPLIT_STEP = 5;

export type EditorSplitHandleProps = Readonly<{
  /** The share of the width the code takes, in percent. */
  share: number;
  onChange: (share: number, remember?: boolean) => void;
  /** The end of a drag: the share is remembered once, not at each move. */
  onDragEnd: () => void;
  className?: string;
}>;

const KEY_MOVES: Readonly<Record<string, (share: number) => number>> = {
  ArrowLeft: (share) => share - EDITOR_SPLIT_STEP,
  ArrowRight: (share) => share + EDITOR_SPLIT_STEP,
  Home: () => SHEET_EDITOR_CODE_SHARE_MIN,
  End: () => SHEET_EDITOR_CODE_SHARE_MAX,
};

/** The divider between the code and the preview: dragged with the pointer (captured, so the
 *  sheet's frame under it never takes the drag) or moved by the arrows, Home and End.
 *
 *  Example: `<EditorSplitHandle share={60} onChange={setCodeShare} onDragEnd={remember} />` */
export function EditorSplitHandle(props: EditorSplitHandleProps): React.JSX.Element {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const move = KEY_MOVES[event.key];
    if (!move) return;
    event.preventDefault();
    props.onChange(move(props.share));
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label="Dividir código e prévia"
      aria-orientation="vertical"
      aria-valuenow={props.share}
      aria-valuemin={SHEET_EDITOR_CODE_SHARE_MIN}
      aria-valuemax={SHEET_EDITOR_CODE_SHARE_MAX}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => startDrag(event, props)}
      className={cn(
        'group relative w-2 shrink-0 cursor-col-resize touch-none outline-none',
        props.className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary/60 group-focus-visible:w-0.5 group-focus-visible:bg-primary motion-reduce:transition-none"
      />
    </div>
  );
}

function shareAt(clientX: number, container: Element): number {
  const box = container.getBoundingClientRect();
  return box.width > 0 ? ((clientX - box.left) / box.width) * 100 : 0;
}

// The share is measured against the row that holds the code, the divider and the preview.
function startDrag(event: PointerEvent<HTMLDivElement>, props: EditorSplitHandleProps): void {
  const handle = event.currentTarget;
  const container = handle.parentElement;
  if (!container) return;
  const follow = (moved: DragPoint): void =>
    props.onChange(shareAt(moved.clientX, container), false);
  if (trackPointerDrag(handle, event, follow, props.onDragEnd)) event.preventDefault();
}
