/** The order after dropping `moved` on `target`: it takes the target's place, and the ones in
 *  between shift by one. Unknown ids leave the order as it is.
 *
 *  Example: `movedTabOrder(['a', 'b', 'c'], 'c', 'a')` → ['c', 'a', 'b'] */
export function movedTabOrder(
  order: readonly string[],
  moved: string,
  target: string,
): readonly string[] {
  const to = order.indexOf(target);
  if (moved === target || to === -1 || !order.includes(moved)) return order;
  const rest = order.filter((id) => id !== moved);
  return [...rest.slice(0, to), moved, ...rest.slice(to)];
}

/** The order after dropping `moved` just before `before`, or at the end when `null`: where a
 *  pointer between two tabs puts it. The same array when it lands where it was, or an id is
 *  unknown.
 *
 *  Example: `insertedTabOrder(['a', 'b', 'c'], 'a', null)` → ['b', 'c', 'a'] */
export function insertedTabOrder(
  order: readonly string[],
  moved: string,
  before: string | null,
): readonly string[] {
  if (moved === before || !order.includes(moved)) return order;
  const rest = order.filter((id) => id !== moved);
  const at = before === null ? rest.length : rest.indexOf(before);
  if (at === -1) return order;
  const next = [...rest.slice(0, at), moved, ...rest.slice(at)];
  return next.every((id, index) => id === order[index]) ? order : next;
}

/** The order after moving `moved` one place left (`-1`) or right (`1`); at an end, unchanged.
 *
 *  Example: `shiftedTabOrder(['a', 'b', 'c'], 'a', 1)` → ['b', 'a', 'c'] */
export function shiftedTabOrder(
  order: readonly string[],
  moved: string,
  step: -1 | 1,
): readonly string[] {
  const target = order[order.indexOf(moved) + step];
  return target === undefined || !order.includes(moved)
    ? order
    : movedTabOrder(order, moved, target);
}

/** The modifiers and key of a press, as a keyboard event has them. */
export type TabMovePress = Readonly<{
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}>;

const MOVE_STEP: Readonly<Record<string, -1 | 1>> = { ArrowLeft: -1, ArrowRight: 1 };

/** The step a press moves the focused tab: Ctrl (or ⌘) + Shift + ← / →, the keyboard twin of
 *  dragging it; `null` for any other press (a bare arrow only moves the focus).
 *
 *  Example: `tabMoveStepOf(event) // -1 for Ctrl+Shift+ArrowLeft` */
export function tabMoveStepOf(press: TabMovePress): -1 | 1 | null {
  if (!(press.ctrlKey || press.metaKey) || !press.shiftKey || press.altKey) return null;
  return MOVE_STEP[press.key] ?? null;
}
