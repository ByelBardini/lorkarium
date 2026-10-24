/** Where an arrow, Home or End key moves the pick in a list of `length`, from `active` (-1 =
 *  none picked: down starts at the top, up at the bottom); `null` for any other key.
 *
 *  Example: `steppedIndex('ArrowDown', 2, 11) // 3` */
export function steppedIndex(key: string, active: number, length: number): number | null {
  if (length === 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  if (key === 'ArrowDown') return active < 0 ? 0 : Math.min(active + 1, length - 1);
  if (key === 'ArrowUp') return active < 0 ? length - 1 : Math.max(active - 1, 0);
  return null;
}
