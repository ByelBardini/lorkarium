import {
  MAX_BARS_PER_TOKEN,
  type CreateSheetBarRequestDto,
  type CreateSheetBarResponseDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { viewerAccessOf } from '../campaigns/member-access';
import type { CharacterPublisherPort } from '../characters/character-publisher.port';
import type { LibraryRequester } from '../library/library.service';
import { publishCharactersChange } from '../tokens/character-writes';
import { publishTokenChange } from '../tokens/token-veil';
import { giveManifestBars, type GivenManifestBars } from './manifest-bar-writes';
import { SheetBarCreationBo } from './sheet-bar-creation.bo';
import type { SheetHolderService } from './sheet-holder.service';
import { SheetItemBo } from './sheet-item.bo';
import { toSheetTemplateManifestDto } from './sheet-templates.mapper';
import type { SheetHolderPlacePo, SheetRow } from './sheets.dao';
import { SheetNotFoundError, SheetTemplateNotFoundError } from './sheets.error';
import { toSheetAccessBo } from './sheets.mapper';
import type { SheetDaos, SheetsServiceDeps, SheetTransaction } from './sheets.service';

export type SheetBarCreationServiceDeps = Readonly<{
  /** The membership read before the lock, as every sheet write does. */
  read: Pick<SheetDaos, 'members'>;
  transaction: SheetTransaction;
  clock: ClockPort;
  /** `character:changed` after a character gains the bar. */
  characterPublisher: CharacterPublisherPort;
  /** `token:updated` after a loose token gains the bar. */
  board: SheetsServiceDeps['board'];
  holders: Pick<SheetHolderService, 'placeOfSheet'>;
}>;

/** The sheet as one who edits it reaches its holder. */
type HeldSheet = Readonly<{ sheet: SheetRow; place: SheetHolderPlacePo }>;
type Created = Readonly<{ answer: CreateSheetBarResponseDto; given: GivenManifestBars }>;

/** `bars.create`: a sheet whose template declares `character:bars` creates on its holder a bar
 *  it lacks (by label, no case or accents), full, after its bars, under the cap. A bar already
 *  there answers its id with `created: false`, writing and telling nothing.
 *
 *  Example: `await barCreation.create({ userId, campaignId }, sheetId, { bar: { label: 'Fôlego', max: 6, color: 'gold' } })` */
export class SheetBarCreationService {
  constructor(private readonly deps: SheetBarCreationServiceDeps) {}

  async create(
    requester: LibraryRequester,
    sheetId: string,
    input: CreateSheetBarRequestDto,
  ): Promise<CreateSheetBarResponseDto> {
    const made = await this.deps.transaction(async (daos): Promise<Created> => {
      const access = await this.lockedAccess(daos, requester);
      const rules = new SheetBarCreationBo(sheetId, MAX_BARS_PER_TOKEN);
      const { sheet, place } = await this.heldSheet(daos, access, sheetId, rules);
      const template = { manifest: { permissions: [], bars: [input.bar], assets: [] } };
      const given = await giveManifestBars(daos, { access, place, template, mainSheets: null });
      const bars = await this.barsOf(daos, sheet.campaignId, place);
      const barId = rules.barIdOf(input.bar.label, bars, given.skippedBars);
      const created = given.characters !== null || given.token !== null;
      return { answer: { barId, created }, given };
    });
    this.published(requester.campaignId, made.given);
    return made.answer;
  }

  // Locks the table, then reads the membership again under the lock.
  private async lockedAccess(
    daos: SheetDaos,
    requester: LibraryRequester,
  ): Promise<CampaignAccessBo> {
    await viewerAccessOf(this.deps.read.members, requester.campaignId, requester.userId);
    if (!(await daos.campaigns.lockById(requester.campaignId)))
      throw new CampaignNotFoundError(requester);
    return viewerAccessOf(daos.members, requester.campaignId, requester.userId);
  }

  // Edit rights first, then the manifest, then a holder: a sheet nobody holds has no bars.
  private async heldSheet(
    daos: SheetDaos,
    access: CampaignAccessBo,
    sheetId: string,
    rules: SheetBarCreationBo,
  ): Promise<HeldSheet> {
    const campaignId = access.campaignIdOf();
    const sheet = await daos.sheets.find(campaignId, sheetId);
    if (!sheet) throw new SheetNotFoundError(campaignId, `sheet ${sheetId}`);
    const place = await this.deps.holders.placeOfSheet(daos, sheet);
    toSheetAccessBo(access, sheet, place).requireEdit('create a bar through');
    const template = await daos.templates.findInCampaign(campaignId, sheet.templateId);
    if (!template) throw new SheetTemplateNotFoundError(campaignId, sheet.templateId);
    rules.requireDeclared(toSheetTemplateManifestDto(template.manifest).permissions);
    new SheetItemBo(campaignId).requireHolder(sheet);
    if (!place) throw new SheetNotFoundError(campaignId, `sheet ${sheetId}`);
    return { sheet, place };
  }

  // Read after the writes, under the locks they took: the bar is there now, new or not.
  private async barsOf(
    daos: SheetDaos,
    campaignId: string,
    place: SheetHolderPlacePo,
  ): Promise<readonly Readonly<{ id: string; label: string }>[]> {
    if ('character' in place) {
      const [row] = await daos.characters.findManyInCampaign(campaignId, [
        place.character.characterId,
      ]);
      return row?.bars ?? [];
    }
    const found = await daos.tokens.findInScene(place.token.sceneId, place.token.tokenId);
    return found?.bars ?? [];
  }

  /** Only after the commit, and only for a bar that was created. */
  private published(campaignId: string, given: GivenManifestBars): void {
    const { clock, characterPublisher: publisher } = this.deps;
    const saved = given.characters;
    publishCharactersChange(
      { publisher, clock },
      campaignId,
      saved?.version ?? null,
      saved?.rows ?? [],
    );
    if (!given.token) return;
    const { sceneId, version, token, veiled } = given.token;
    const base = { campaignId, sceneId, version, at: clock.now().toISOString() };
    publishTokenChange(this.deps.board, 'token:updated', base, token, veiled);
  }
}
