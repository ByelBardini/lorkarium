import type { SheetSummaryDto } from '@lorkarium/contracts';

type SheetHolderFields = Pick<SheetSummaryDto, 'tokenId' | 'memberId'>;

/** Whether nobody holds the sheet: no token and no character (a character's sheet names its
 *  player in `memberId`, with no `tokenId`). Only masters see such a sheet.
 *
 *  Example: `isSpareSheet({ tokenId: null, memberId: biaId }) // false: Lyra's` */
export function isSpareSheet({ tokenId, memberId }: SheetHolderFields): boolean {
  return tokenId === null && memberId === null;
}
