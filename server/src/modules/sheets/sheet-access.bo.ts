import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { CharacterBo, type CharacterSeat } from '../characters/character.bo';
import { TokenAccessBo, type TokenControl } from '../tokens/token-access.bo';
import { SheetNotFoundError } from './sheets.error';

/** Who holds a sheet, as its access reads it: a token with its control and whether the reader
 *  sees where it stands (a grid by its visibility), or a character with whose it is. */
export type SheetHolderReach =
  Readonly<{ token: TokenControl; seen: boolean }> | Readonly<{ character: CharacterSeat }>;

/** What the access reads of a sheet: which one, who besides the masters and the controllers of
 *  its holder reads it, and its holder (`null` = nobody holds it). */
export type SheetReach = Readonly<{
  sheetId: string;
  visibility: 'controllers' | 'table';
  holder: SheetHolderReach | null;
}>;

/** What the reader is to the holder of a sheet: whether they see it and control it. */
type HolderRights = Readonly<{ seen: boolean; controlled: boolean }>;

/** What one member may do with one sheet: the masters and the controllers of its holder read and
 *  edit it; with `table` every member (spectators too) who sees the holder reads it; only the
 *  masters manage it. A character holder is controlled by its player, its controllers and the
 *  masters, and seen by the table only while its player plays (a stored one is the masters'). A
 *  sheet nobody holds is the masters' alone. A sheet that may not be read is SHEET_NOT_FOUND,
 *  never FORBIDDEN, so its existence never leaks.
 *
 *  Example: `new SheetAccessBo(access, reach).requireEdit('write values of') // FORBIDDEN for Caio on a table sheet` */
export class SheetAccessBo {
  private readonly holder: HolderRights | null;

  constructor(
    private readonly access: CampaignAccessBo,
    private readonly sheet: SheetReach,
  ) {
    this.holder = sheet.holder ? holderRightsOf(access, sheet.holder) : null;
  }

  canRead(): boolean {
    if (!this.holder) return this.access.isMaster();
    if (!this.holder.seen) return false;
    return this.holder.controlled || this.sheet.visibility === 'table';
  }

  /** Writes values and bars: what the reader already does by hand with the holder. */
  canEdit(): boolean {
    if (!this.holder) return this.access.isMaster();
    return this.canRead() && this.holder.controlled;
  }

  /** Name, folder, holder, visibility, template and deletion. */
  canManage(): boolean {
    return this.canRead() && this.access.isMaster();
  }

  requireRead(): void {
    if (this.canRead()) return;
    throw new SheetNotFoundError(this.access.campaignIdOf(), `sheet ${this.sheet.sheetId}`);
  }

  requireEdit(action: string): void {
    this.requireRead();
    if (this.canEdit()) return;
    this.access.forbid(
      `${action} sheet ${this.sheet.sheetId}`,
      'the master role or control of its holder',
    );
  }

  requireManage(action: string): void {
    this.requireRead();
    this.access.requireMaster(`${action} sheet ${this.sheet.sheetId}`);
  }
}

function holderRightsOf(access: CampaignAccessBo, holder: SheetHolderReach): HolderRights {
  if ('token' in holder) {
    const controlled = new TokenAccessBo(access, holder.token).canControl();
    return { seen: holder.seen, controlled };
  }
  const character = new CharacterBo(access, holder.character);
  return { seen: character.isSeen(), controlled: character.canControl() };
}
