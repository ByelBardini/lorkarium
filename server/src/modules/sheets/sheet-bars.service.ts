import type { SheetAdjustBarCommandDto } from '@lorkarium/contracts';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { viewerAccessOf } from '../campaigns/member-access';
import type { TokensService } from '../tokens/tokens.service';
import type { SheetsDao } from './sheets.dao';
import { SheetNotFoundError } from './sheets.error';
import { toSheetAccessBo } from './sheets.mapper';
import { SheetItemBo } from './sheet-item.bo';

export type SheetBarsServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  /** Read on the pool: the tokens service checks the control again under its lock. */
  sheets: Pick<SheetsDao, 'find' | 'placeOf'>;
  tokens: Pick<TokensService, 'adjustHolderBar'>;
}>;

type SheetBarCommand = Omit<SheetAdjustBarCommandDto, 'actionId' | 'campaignId'>;

/** `sheet:adjustBar`: the server finds the token of the sheet (the frame never names one) and
 *  hands the bar to the tokens service, which applies the rule of `token:adjustBar` and publishes
 *  its `token:updated`. Returns the version that event carries.
 *
 *  Example: `await sheetBars.adjustBar(userId, campaignId, { sheetId, barId, change: { op: 'add', amount: -7 } })` */
export class SheetBarsService {
  constructor(private readonly deps: SheetBarsServiceDeps) {}

  async adjustBar(userId: string, campaignId: string, command: SheetBarCommand): Promise<number> {
    const access = await viewerAccessOf(this.deps.members, campaignId, userId);
    const sheet = await this.deps.sheets.find(campaignId, command.sheetId);
    if (!sheet) throw new SheetNotFoundError(campaignId, `sheet ${command.sheetId}`);
    const place = sheet.tokenId ? await this.deps.sheets.placeOf(campaignId, sheet.tokenId) : null;
    toSheetAccessBo(access, sheet, place ?? null).requireEdit('adjust a bar through');
    new SheetItemBo(campaignId).requireToken(sheet);
    if (!place) throw new SheetNotFoundError(campaignId, `sheet ${command.sheetId}`);
    const sceneId = place.kind === 'cast' ? null : place.sceneId;
    const { barId, change } = command;
    const bar = { tokenId: place.tokenId, sceneId, barId, change };
    return this.deps.tokens.adjustHolderBar(userId, campaignId, bar);
  }
}
