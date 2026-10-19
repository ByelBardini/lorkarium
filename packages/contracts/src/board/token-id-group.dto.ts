import { z } from 'zod';

/** Items one group command may carry; a marquee bigger than this is cut by the client. */
export const TOKEN_GROUP_MAX = 64;

/** The first id that appears twice, if any.
 *
 *  Example: `firstRepeated(['a', 'b', 'a'])` → `'a'` */
export function firstRepeated(ids: string[]): string | undefined {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return undefined;
}

/** A list of 1 to 64 items, one per board element (token, drawing), refusing the same id twice;
 *  `noun` names the element in the message.
 *
 *  Example: `idGroupOf(drawingMoveDto, (move) => move.drawingId, 'drawing')` */
export function idGroupOf<Item extends z.ZodType>(
  item: Item,
  idOf: (value: z.output<Item>) => string,
  noun: string,
) {
  return z
    .array(item)
    .min(1)
    .max(TOKEN_GROUP_MAX)
    .superRefine((items, context) => {
      const repeated = firstRepeated(items.map(idOf));
      if (repeated === undefined) return;
      context.addIssue({
        code: 'custom',
        message: `${noun} ${repeated} appears more than once; expected distinct ${noun} ids`,
      });
    });
}

/** A list of 1 to 64 items, one per token, refusing the same token twice.
 *
 *  Example: `tokenGroupOf(tokenCellDto, (move) => move.tokenId)` */
export function tokenGroupOf<Item extends z.ZodType>(
  item: Item,
  idOf: (value: z.output<Item>) => string,
) {
  return idGroupOf(item, idOf, 'token');
}

/** The id of an undo precondition that names an element the command does not touch, if any.
 *
 *  Example: `strayExpectation(['a'], ['a', 'b'])` → `'b'` */
export function strayExpectation(targetIds: string[], expectedIds: string[]): string | undefined {
  const targets = new Set(targetIds);
  return expectedIds.find((id) => !targets.has(id));
}

/** 1 to 64 distinct token ids: the target of a group command. */
export const tokenIdGroupDto = tokenGroupOf(z.uuid(), (tokenId) => tokenId);
