import { useState, type DragEvent } from 'react';
import { insertedTabOrder } from '@/lib/tab-order';

// The type Lorkarium puts on a room tab drag; the text one is for browsers that drag only with text.
const DRAG_TYPE = 'application/x-lorkarium-room-tab';

/** The attribute that names the room key of a tab's frame. */
export const ROOM_TAB_ATTRIBUTE = 'data-room-tab';

/** Where the dragged tab would land, beside the tab marked. */
export type RoomTabDropSide = 'before' | 'after';

type DragProps = Readonly<Record<string, unknown>>;

export type RoomTabDrag = Readonly<{
  /** For a tab's frame: dragged, unless `fixed` (the group's). */
  sourceProps: (key: string, name: string, fixed: boolean) => DragProps;
  /** For the whole strip, the empty room after the last tab too: where a tab is dropped. */
  zoneProps: DragProps;
  /** The side of `key` marked while a tab is dragged over the strip, or `undefined`. */
  dropSideOf: (key: string) => RoomTabDropSide | undefined;
}>;

type DragOptions = Readonly<{
  /** The keys in the strip's order, the fixed group first. */
  order: readonly string[];
  /** `before` is the tab it lands before; `null`, the end. */
  onMove: (key: string, before: string | null) => void;
}>;

type Drop = Readonly<{ before: string | null; mark: string; side: RoomTabDropSide }>;

/** The native drag and drop of the room's tabs (the pattern of `use-document-tab-drag.ts`). The
 *  pointer picks the gap: before the tab whose left half it is on, after the one whose right half,
 *  and past the last tab, the end; nothing lands before the fixed first tab. Only a tab of this
 *  strip is taken: a drag from elsewhere (the library) is not.
 *
 *  Example: `const drag = useRoomTabDrag({ order: keys, onMove: (key, before) => tabs.getState().moveTab(key, before) })` */
export function useRoomTabDrag({ order, onMove }: DragOptions): RoomTabDrag {
  const [dragged, setDragged] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const reset = (): void => {
    setDragged(null);
    setDrop(null);
  };
  const sourceProps = (key: string, name: string, fixed: boolean): DragProps => {
    if (fixed) return {};
    return {
      draggable: true,
      onDragStart: (event: DragEvent) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(DRAG_TYPE, key);
        event.dataTransfer.setData('text/plain', name);
        setDragged(key);
      },
      onDragEnd: reset,
    };
  };
  const zoneProps: DragProps = dragged
    ? {
        onDragOver: (event: DragEvent<HTMLElement>) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDrop(dropAt(event.currentTarget, event.clientX, order, dragged));
        },
        onDragLeave: (event: DragEvent<HTMLElement>) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(null);
        },
        onDrop: (event: DragEvent<HTMLElement>) => {
          event.preventDefault();
          const landing = dropAt(event.currentTarget, event.clientX, order, dragged);
          reset();
          if (landing) onMove(dragged, landing.before);
        },
      }
    : {};
  const dropSideOf = (key: string): RoomTabDropSide | undefined =>
    drop?.mark === key ? drop.side : undefined;
  return { sourceProps, zoneProps, dropSideOf };
}

// The frames on screen, in order (the ones in "+N" have none). `null` when the drop would leave
// the tab where it is: no mark for a move that moves nothing.
function dropAt(
  zone: HTMLElement,
  pointerX: number,
  order: readonly string[],
  dragged: string,
): Drop | null {
  const frames = [...zone.querySelectorAll<HTMLElement>(`[${ROOM_TAB_ATTRIBUTE}]`)];
  const keys = frames.map((frame) => frame.getAttribute(ROOM_TAB_ATTRIBUTE) ?? '');
  const gap = Math.max(1, gapIndexOf(frames, pointerX));
  const last = keys[keys.length - 1];
  if (last === undefined) return null;
  const marked = keys[gap];
  // Past the last frame: before the tab that follows it in the order (one in "+N"), or the end.
  const before = marked ?? order[order.indexOf(last) + 1] ?? null;
  const extras = order.slice(1);
  if (insertedTabOrder(extras, dragged, before) === extras) return null;
  return marked ? { before, mark: marked, side: 'before' } : { before, mark: last, side: 'after' };
}

// The first frame whose middle is right of the pointer; past them all, their count.
function gapIndexOf(frames: readonly HTMLElement[], pointerX: number): number {
  const at = frames.findIndex((frame) => {
    const box = frame.getBoundingClientRect();
    return pointerX < box.left + box.width / 2;
  });
  return at === -1 ? frames.length : at;
}
