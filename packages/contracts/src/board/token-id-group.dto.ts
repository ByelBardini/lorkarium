import { z } from 'zod';

/** Tokens one group command may carry; a marquee bigger than this is cut by the client. */
export const TOKEN_GROUP_MAX = 64;

function firstRepeated(ids: string[]): string | undefined {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return undefined;
}

/** A list of 1 to 64 items, one per token, refusing the same token twice.
 *
 *  Example: `tokenGroupOf(tokenCellDto, (move) => move.tokenId)` */
export function tokenGroupOf<Item extends z.ZodType>(
  item: Item,
  idOf: (value: z.output<Item>) => string,
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
        message: `token ${repeated} appears more than once; expected distinct token ids`,
      });
    });
}

/** 1 to 64 distinct token ids: the target of a group command. */
export const tokenIdGroupDto = tokenGroupOf(z.uuid(), (tokenId) => tokenId);
