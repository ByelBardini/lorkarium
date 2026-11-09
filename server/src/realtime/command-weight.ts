import { COMMAND_BURST } from './command-rate.bo';

/** Structured items (points, shapes, moves) one bucket token pays for. Sized so the largest command
 *  the DTOs admit (64 paths of 2000 points, about 128k items) costs 33 and still fits the burst. */
export const ITEMS_PER_TOKEN = 4000;

// Past this no bucket admits the command, so there is no reason to keep counting.
const ITEMS_COUNTED_MAX = (COMMAND_BURST + 1) * ITEMS_PER_TOKEN;

/** What a command costs in bucket tokens, read from its raw payload before any validation: one,
 *  plus one for every `ITEMS_PER_TOKEN` objects and arrays it carries. Numbers and strings are not
 *  counted, so a freehand point weighs one item. Malformed input costs one and validation refuses it.
 *
 *  Example: `commandCostOf({ drawings: sixteenFullStrokes }) // 9` */
export function commandCostOf(payload: unknown): number {
  return 1 + Math.floor(structuredItemsOf(payload) / ITEMS_PER_TOKEN);
}

// A stack, not recursion: the payload is untrusted and may nest as deep as the frame allows.
function structuredItemsOf(payload: unknown): number {
  const pending: unknown[] = [payload];
  let items = 0;
  while (pending.length > 0 && items <= ITEMS_COUNTED_MAX) {
    for (const child of childrenOf(pending.pop())) {
      if (typeof child !== 'object' || child === null) continue;
      items += 1;
      pending.push(child);
      if (items > ITEMS_COUNTED_MAX) break;
    }
  }
  return items;
}

function childrenOf(node: unknown): readonly unknown[] {
  if (Array.isArray(node)) return node as readonly unknown[];
  return typeof node === 'object' && node !== null ? Object.values(node) : [];
}
