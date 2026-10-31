import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { TokenAccessBo, type TokenControl } from '../tokens/token-access.bo';
import { SheetNotFoundError } from './sheets.error';

/** What the access reads of a sheet: which one, who besides the masters and the controllers of
 *  its token reads it, the token that holds it (the anchor of a character) with its control, and
 *  whether the reader sees where that token stands (the cast always; a grid by its visibility).
 *  `holder: null` is a sheet nobody holds. */
export type SheetReach = Readonly<{
  sheetId: string;
  visibility: 'controllers' | 'table';
  holder: TokenControl | null;
  holderSeen: boolean;
}>;

/** What one member may do with one sheet: the masters and the token's controllers read and edit
 *  it; with `table` every member (spectators too) reads it; only the masters manage it. A sheet
 *  nobody holds is the masters' alone. A sheet that may not be read is SHEET_NOT_FOUND, never
 *  FORBIDDEN, so its existence never leaks.
 *
 *  Example: `new SheetAccessBo(access, reach).requireEdit('write values of') // FORBIDDEN for Caio on a table sheet` */
export class SheetAccessBo {
  private readonly token: TokenAccessBo | null;

  constructor(
    private readonly access: CampaignAccessBo,
    private readonly sheet: SheetReach,
  ) {
    this.token = sheet.holder ? new TokenAccessBo(access, sheet.holder) : null;
  }

  canRead(): boolean {
    if (!this.token) return this.access.isMaster();
    if (!this.sheet.holderSeen) return false;
    return this.token.canControl() || this.sheet.visibility === 'table';
  }

  /** Writes values and bars: what the reader already does by hand with the token. */
  canEdit(): boolean {
    if (!this.token) return this.access.isMaster();
    return this.canRead() && this.token.canControl();
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
      'the master role or control of its token',
    );
  }

  requireManage(action: string): void {
    this.requireRead();
    this.access.requireMaster(`${action} sheet ${this.sheet.sheetId}`);
  }
}
