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
