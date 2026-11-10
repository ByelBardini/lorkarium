import type { SheetAdjustBarCommandDto, SheetSpendBarsCommandDto } from '@lorkarium/contracts';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { viewerAccessOf } from '../campaigns/member-access';
import type { CharactersService } from '../characters/characters.service';
import type { TokensService } from '../tokens/tokens.service';
import { spentBarWritesOf, type HeldBar, type SheetBarHolder } from './sheet-bars.bo';
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
  tokens: Pick<TokensService, 'adjustBar' | 'rewriteBars'>;
  characters: Pick<CharactersService, 'adjustBar' | 'rewriteBars'>;
}>;

type SheetBarCommand = Omit<SheetAdjustBarCommandDto, 'actionId' | 'campaignId'>;
type SheetSpendCommand = Omit<SheetSpendBarsCommandDto, 'actionId' | 'campaignId'>;

/** Who pays for the sheet, and the grid of a token holder. */
type HeldSheet = Readonly<{ holder: SheetBarHolder; sceneId?: string }>;

/** `sheet:adjustBar` and `sheet:spendBars`: the server finds the holder of the sheet (the frame
 *  never names one) and hands the bars to it: a token's to the tokens service (`token:updated`),
 *  a character's to the characters service (`character:changed`). Returns the version that event
 *  carries.
 *
 *  Example: `await sheetBars.adjustBar(userId, campaignId, { sheetId, barId, change: { op: 'add', amount: -7 } })` */
export class SheetBarsService {
  constructor(private readonly deps: SheetBarsServiceDeps) {}

  async adjustBar(userId: string, campaignId: string, command: SheetBarCommand): Promise<number> {
    const { holder, sceneId } = await this.heldSheet(
      userId,
      campaignId,
      command.sheetId,
      'adjust a bar through',
    );
    const { barId, change } = command;
    if ('characterId' in holder)
      return this.deps.characters.adjustBar(userId, campaignId, { ...holder, barId, change });
    const bar = { tokenId: holder.tokenId, sceneId, barId, change };
    return this.deps.tokens.adjustBar(userId, campaignId, bar);
  }

  /** All the costs or none, from the holder's current values (`spentBarWritesOf`), in the
   *  holder's own lock: one short is INSUFFICIENT_BAR, nothing saved and nothing published.
   *
   *  Example: `await sheetBars.spendBars(userId, campaignId, { sheetId, costs: [{ barId: mp, amount: 6 }] })` */
  async spendBars(userId: string, campaignId: string, command: SheetSpendCommand): Promise<number> {
    const { holder, sceneId } = await this.heldSheet(
      userId,
      campaignId,
      command.sheetId,
      'spend bars through',
    );
    const rule = (bars: readonly HeldBar[]) => spentBarWritesOf(holder, bars, command.costs);
    if ('characterId' in holder)
      return this.deps.characters.rewriteBars(userId, campaignId, holder.characterId, rule);
    const address = { tokenId: holder.tokenId, sceneId };
    return this.deps.tokens.rewriteBars(userId, campaignId, address, rule);
  }

  // Read on the pool, edit rights first; a sheet nobody holds has no bars.
  private async heldSheet(
    userId: string,
    campaignId: string,
    sheetId: string,
    action: string,
  ): Promise<HeldSheet> {
    const access = await viewerAccessOf(this.deps.members, campaignId, userId);
    const sheet = await this.deps.sheets.find(campaignId, sheetId);
    if (!sheet) throw new SheetNotFoundError(campaignId, `sheet ${sheetId}`);
    const place = await this.deps.holders.placeOfSheet(this.deps, sheet);
    toSheetAccessBo(access, sheet, place).requireEdit(action);
    const holder = new SheetItemBo(campaignId).requireHolder(sheet);
    if ('characterId' in holder) return { holder };
    if (!place || !('token' in place)) throw new SheetNotFoundError(campaignId, sheet.id);
    return { holder, sceneId: place.token.sceneId };
  }
}
