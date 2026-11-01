import type { SheetAdjustBarCommandDto } from '@lorkarium/contracts';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { viewerAccessOf } from '../campaigns/member-access';
import type { CharactersService } from '../characters/characters.service';
import type { TokensService } from '../tokens/tokens.service';
import type { SheetHolderDaos, SheetHolderService } from './sheet-holder.service';
import { SheetItemBo } from './sheet-item.bo';
import type { SheetsDao } from './sheets.dao';
import { SheetNotFoundError } from './sheets.error';
import { toSheetAccessBo } from './sheets.mapper';

export type SheetBarsServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  /** Read on the pool: the tokens and the characters services check the control again under
   *  their lock. */
  sheets: SheetHolderDaos['sheets'] & Pick<SheetsDao, 'find'>;
  holders: Pick<SheetHolderService, 'placeOfSheet'>;
  tokens: Pick<TokensService, 'adjustBar'>;
  characters: Pick<CharactersService, 'adjustBar'>;
}>;

type SheetBarCommand = Omit<SheetAdjustBarCommandDto, 'actionId' | 'campaignId'>;

/** `sheet:adjustBar`: the server finds the holder of the sheet (the frame never names one) and
 *  hands the bar to it: a token's to the tokens service (the rule and `token:updated` of
 *  `token:adjustBar`), a character's to the characters service (`character:changed`). Returns the
 *  version that event carries.
 *
 *  Example: `await sheetBars.adjustBar(userId, campaignId, { sheetId, barId, change: { op: 'add', amount: -7 } })` */
export class SheetBarsService {
  constructor(private readonly deps: SheetBarsServiceDeps) {}

  async adjustBar(userId: string, campaignId: string, command: SheetBarCommand): Promise<number> {
    const access = await viewerAccessOf(this.deps.members, campaignId, userId);
    const sheet = await this.deps.sheets.find(campaignId, command.sheetId);
    if (!sheet) throw new SheetNotFoundError(campaignId, `sheet ${command.sheetId}`);
    const place = await this.deps.holders.placeOfSheet(this.deps, sheet);
    toSheetAccessBo(access, sheet, place).requireEdit('adjust a bar through');
    const holder = new SheetItemBo(campaignId).requireHolder(sheet);
    const { barId, change } = command;
    if ('characterId' in holder)
      return this.deps.characters.adjustBar(userId, campaignId, { ...holder, barId, change });
    if (!place || !('token' in place)) throw new SheetNotFoundError(campaignId, sheet.id);
    const bar = { tokenId: holder.tokenId, sceneId: place.token.sceneId, barId, change };
    return this.deps.tokens.adjustBar(userId, campaignId, bar);
  }
}
