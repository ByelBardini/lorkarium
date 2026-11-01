import {
  sheetReceiptDto,
  sheetValuesDto,
  type SheetReceiptDto,
  type CreateSheetRequestDto,
  type DeleteSheetRequestDto,
  type SheetResponseDto,
  type SheetWriteResponseDto,
  type TokenSheetsResponseDto,
  type UpdateSheetRequestDto,
  type UpdateSheetValuesRequestDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { CampaignsDao } from '../campaigns/campaigns.dao';
import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { viewerAccessOf } from '../campaigns/member-access';
import { CharacterBo } from '../characters/character.bo';
import type { CharacterPublisherPort } from '../characters/character-publisher.port';
import { commandFingerprint } from '../documents/document-writes.service';
import type { LibraryPublisherPort } from '../library/library-publisher.port';
import type { LibraryRequester } from '../library/library.service';
import type { SceneFoldersDao } from '../library/scene-folders.dao';
import { publishCharactersChange } from '../tokens/character-writes';
import type { SheetAccessBo } from './sheet-access.bo';
import {
  characterPlaceIn,
  type SheetHolderDaos,
  type SheetHolderService,
} from './sheet-holder.service';
import { keepMainSheet, type MainSheetDaos, type SavedMainSheets } from './main-sheet-writes';
import { SheetItemBo } from './sheet-item.bo';
import type { SheetPublisherPort } from './sheet-publisher.port';
import type { SheetTemplatesDao } from './sheet-templates.dao';
import { toSheetTemplateCodeDto } from './sheet-templates.mapper';
import type { SheetTemplatePo } from './sheet-templates.po';
import type { SheetHolderPlacePo, SheetsDao } from './sheets.dao';
import {
  SheetActionReusedError,
  SheetNotFoundError,
  SheetTemplateNotFoundError,
} from './sheets.error';
import {
  readableHolderSheets,
  toHolderColumns,
  toSheetAccessBo,
  toSheetChangesPo,
  toSheetDto,
  toSheetReceiptDto,
  toValuesChange,
} from './sheets.mapper';
import type { SheetPo } from './sheets.po';

export type SheetDaos = SheetHolderDaos &
  MainSheetDaos &
  Readonly<{
    campaigns: Pick<CampaignsDao, 'lockById'>;
    members: Pick<CampaignMembersDao, 'findMembership'>;
    sheets: Pick<
      SheetsDao,
      | 'find'
      | 'listOfToken'
      | 'listOfCharacter'
      | 'characterPlacesOf'
      | 'characterPlaceOfUser'
      | 'insert'
      | 'patchValues'
      | 'update'
      | 'delete'
      | 'placeOf'
      | 'action'
      | 'recordAction'
    >;
    templates: Pick<SheetTemplatesDao, 'findInCampaign'>;
    folders: Pick<SceneFoldersDao, 'listOfCampaign'>;
  }>;
export type SheetTransaction = <T>(work: (daos: SheetDaos) => Promise<T>) => Promise<T>;
export type SheetsServiceDeps = Readonly<{
  read: SheetDaos;
  transaction: SheetTransaction;
  snapshot: SheetTransaction;
  clock: ClockPort;
  publisher: SheetPublisherPort;
  /** `library:changed` after a sheet appears, goes, or changes its line in the library. */
  library: Pick<LibraryPublisherPort, 'libraryChanged'>;
  /** `character:changed` after a character's main sheet changes. */
  characterPublisher: CharacterPublisherPort;
  holders: SheetHolderService;
}>;

/** One sheet loaded for a command: the row, its holder's place and what the requester may do. */
type SheetScope = Readonly<{
  daos: SheetDaos;
  sheet: SheetPo;
  place: SheetHolderPlacePo | null;
  rules: SheetAccessBo;
}>;
/** What a transaction answers and what to tell after the commit: the sheet's new version, whether
 *  its library line changed, and the characters whose main sheet it changed. */
type Applied<T> = Readonly<{
  value: T;
  changed: Readonly<{ sheetId: string; version: number }> | null;
  library: boolean;
  characters: SavedMainSheets | null;
}>;
/** The receipt a write gets: which action, its fingerprint and what it did. */
type ReceiptCommand = Readonly<{
  actionId: string;
  fingerprint: string;
  operation: SheetReceiptDto['operation'];
}>;
type Saved = Readonly<{ sheet: SheetPo; characters: SavedMainSheets | null }>;
type WriteInput = UpdateSheetValuesRequestDto | UpdateSheetRequestDto;
/** What a write is, for the receipt, what it takes of the requester (checked on a replay too)
 *  and whether the library shows what it changes. */
type WriteKind = Readonly<{
  operation: 'values' | 'update';
  authorize: (rules: SheetAccessBo) => void;
  library: boolean;
}>;
const VALUES_WRITE: WriteKind = {
  operation: 'values',
  authorize: (rules) => rules.requireEdit('write values of'),
  library: false,
};
const MANAGE_WRITE: WriteKind = {
  operation: 'update',
  authorize: (rules) => rules.requireManage('manage'),
  library: true,
};

/** The sheets of the library: read, create (nobody's, a token's or a character's), write values,
 *  manage and delete. Every write locks the table, keeps an idempotent receipt per `actionId`,
 *  commits, and only then tells the table `sheet:changed` (without values), `library:changed`
 *  when the library line changed and `character:changed` when a character's main sheet did.
 *
 *  Example: `await sheets.updateValues({ userId, campaignId }, sheetId, { actionId, changes: { forca: 16 } })` */
export class SheetsService {
  constructor(private readonly deps: SheetsServiceDeps) {}

  async get(requester: LibraryRequester, sheetId: string): Promise<SheetResponseDto> {
    return this.deps.snapshot(async (daos) => {
      const access = await viewerAccessOf(daos.members, requester.campaignId, requester.userId);
      return this.view(await this.scopeOf(daos, access, sheetId));
    });
  }

  /** The sheets of a token the reader may read: a linked token's are its character's. A token of
   *  another table is TOKEN_NOT_FOUND. */
  async listOfToken(requester: LibraryRequester, tokenId: string): Promise<TokenSheetsResponseDto> {
    const { campaignId, userId } = requester;
    return this.deps.snapshot(async (daos) => {
      const access = await viewerAccessOf(daos.members, campaignId, userId);
      const place = await this.deps.holders.resolve(daos, campaignId, { tokenId });
      return this.readableOf(daos, access, place);
    });
  }

  /** The sheets of a character the reader may read, from any grid. A character of another table,
   *  or one the reader does not see (stored), is CHARACTER_NOT_FOUND. */
  async listOfCharacter(
    requester: LibraryRequester,
    characterId: string,
  ): Promise<TokenSheetsResponseDto> {
    const { campaignId, userId } = requester;
    return this.deps.snapshot(async (daos) => {
      const access = await viewerAccessOf(daos.members, campaignId, userId);
      const character = await characterPlaceIn(daos, campaignId, characterId);
      new CharacterBo(access, character).requireSeen();
      return this.readableOf(daos, access, { character });
    });
  }

  private async readableOf(
    daos: SheetDaos,
    access: CampaignAccessBo,
    place: SheetHolderPlacePo | null,
  ): Promise<TokenSheetsResponseDto> {
    if (!place) return { sheets: [] };
    const sheets = await this.deps.holders.sheetsOf(daos, access.campaignIdOf(), place);
    return { sheets: readableHolderSheets(access, sheets, place) };
  }

  /** A sheet of `templateId` in the library (master only): nobody's, a token's (a linked one's
   *  goes to its character) or a player's (their character's); a character's first sheet becomes
   *  its main one. */
  async create(
    requester: LibraryRequester,
    input: CreateSheetRequestDto,
  ): Promise<SheetWriteResponseDto> {
    const result = await this.deps.transaction(async (daos) => {
      const access = await this.lockedAccess(daos, requester);
      access.requireMaster('create a sheet');
      const fingerprint = commandFingerprint('sheet-create', null, input);
      const previous = await this.previous(daos, requester, input.actionId, fingerprint);
      if (previous) return this.replay(daos, access, previous);
      const saved = await this.inserted(daos, access, input);
      const command = { actionId: input.actionId, fingerprint, operation: 'create' } as const;
      return this.recorded(daos, requester, access, command, saved);
    });
    return this.published(requester.campaignId, result);
  }

  private async inserted(
    daos: SheetDaos,
    access: CampaignAccessBo,
    input: CreateSheetRequestDto,
  ): Promise<Saved> {
    const campaignId = access.campaignIdOf();
    const folderId = input.folderId ?? null;
    await this.templateOf(daos, campaignId, input.templateId);
    await this.requireFolder(daos, campaignId, folderId);
    const holder = await this.deps.holders.resolve(daos, campaignId, input.holder ?? null);
    const columns = toHolderColumns(holder);
    const sheet = await daos.sheets.insert({
      ...{ campaignId, templateId: input.templateId, name: input.name, folderId },
      ...columns,
      visibility: input.visibility ?? 'controllers',
    });
    const move = { from: null, to: columns.characterId };
    return { sheet, characters: await keepMainSheet(daos, campaignId, sheet.id, move) };
  }

  /** Each key replaces the stored one, `null` removes it; the last write wins per key. The merged
   *  values must still fit the budget, or nothing is saved. */
  async updateValues(
    requester: LibraryRequester,
    sheetId: string,
    input: UpdateSheetValuesRequestDto,
  ): Promise<SheetWriteResponseDto> {
    return this.write(requester, sheetId, input, VALUES_WRITE, async ({ daos }) => {
      const change = { ...toValuesChange(input.changes), updatedAt: this.deps.clock.now() };
      const saved = await daos.sheets.patchValues(requester.campaignId, sheetId, change);
      sheetValuesDto.parse(saved.values);
      return { sheet: saved, characters: null };
    });
  }

  /** Renames, moves, gives (or takes from its holder), changes the visibility or the template of
   *  a sheet (master only); the main sheets follow a sheet given or taken. */
  async update(
    requester: LibraryRequester,
    sheetId: string,
    input: UpdateSheetRequestDto,
  ): Promise<SheetWriteResponseDto> {
    const { campaignId } = requester;
    return this.write(requester, sheetId, input, MANAGE_WRITE, async ({ daos, sheet }) => {
      if (input.templateId) await this.templateOf(daos, campaignId, input.templateId);
      if (input.folderId !== undefined) await this.requireFolder(daos, campaignId, input.folderId);
      const holder = await this.holderChangeOf(daos, campaignId, input);
      const from = sheet.characterId;
      const saved = await daos.sheets.update(campaignId, sheetId, {
        ...toSheetChangesPo(input, holder),
        version: sheet.version + 1,
        updatedAt: this.deps.clock.now(),
      });
      const move = { from, to: saved.characterId };
      return { sheet: saved, characters: await keepMainSheet(daos, campaignId, sheetId, move) };
    });
  }

  private async holderChangeOf(
    daos: SheetDaos,
    campaignId: string,
    input: UpdateSheetRequestDto,
  ): Promise<SheetHolderPlacePo | null> {
    if (input.holder === undefined) return null;
    return this.deps.holders.resolve(daos, campaignId, input.holder);
  }

  /** Master only; a repeated `actionId` does nothing again. A character's main sheet goes with
   *  it (the character has none). */
  async delete(
    requester: LibraryRequester,
    sheetId: string,
    input: DeleteSheetRequestDto,
  ): Promise<void> {
    const result = await this.deps.transaction(async (daos): Promise<Applied<void>> => {
      const access = await this.lockedAccess(daos, requester);
      const fingerprint = commandFingerprint('sheet-delete', sheetId, input);
      if (await this.previous(daos, requester, input.actionId, fingerprint))
        return { value: undefined, changed: null, library: false, characters: null };
      const { sheet, rules } = await this.scopeOf(daos, access, sheetId);
      rules.requireManage('delete');
      const move = { from: sheet.characterId, to: null };
      const characters = await keepMainSheet(daos, requester.campaignId, sheetId, move);
      await daos.sheets.delete(requester.campaignId, sheetId);
      const gone = { id: sheet.id, version: sheet.version + 1 };
      const receipt = toSheetReceiptDto(input.actionId, gone, 'delete');
      await this.record(daos, requester, receipt, fingerprint);
      const changed = { sheetId, version: gone.version };
      return { value: undefined, changed, library: true, characters };
    });
    this.published(requester.campaignId, result);
  }

  private async write(
    requester: LibraryRequester,
    sheetId: string,
    input: WriteInput,
    kind: WriteKind,
    save: (scope: SheetScope) => Promise<Saved>,
  ): Promise<SheetWriteResponseDto> {
    const result = await this.deps.transaction(async (daos) => {
      const access = await this.lockedAccess(daos, requester);
      const scope = await this.scopeOf(daos, access, sheetId);
      kind.authorize(scope.rules);
      const fingerprint = commandFingerprint(`sheet-${kind.operation}`, sheetId, input);
      const previous = await this.previous(daos, requester, input.actionId, fingerprint);
      if (previous) return this.replay(daos, access, previous);
      const command = { actionId: input.actionId, fingerprint, operation: kind.operation };
      const saved = await save(scope);
      const applied = await this.recorded(daos, requester, access, command, saved);
      return { ...applied, library: kind.library };
    });
    return this.published(requester.campaignId, result);
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

  /** The sheet as the requester may read it; another table's and unreadable ones are
   *  SHEET_NOT_FOUND. */
  private async scopeOf(
    daos: SheetDaos,
    access: CampaignAccessBo,
    sheetId: string,
  ): Promise<SheetScope> {
    const sheet = await daos.sheets.find(access.campaignIdOf(), sheetId);
    if (!sheet) throw new SheetNotFoundError(access.campaignIdOf(), `sheet ${sheetId}`);
    const place = await this.deps.holders.placeOfSheet(daos, sheet);
    const rules = toSheetAccessBo(access, sheet, place);
    rules.requireRead();
    return { daos, sheet, place, rules };
  }

  private async templateOf(
    daos: SheetDaos,
    campaignId: string,
    templateId: string,
  ): Promise<SheetTemplatePo> {
    const template = await daos.templates.findInCampaign(campaignId, templateId);
    if (!template) throw new SheetTemplateNotFoundError(campaignId, templateId);
    return template;
  }

  private async requireFolder(
    daos: SheetDaos,
    campaignId: string,
    folderId: string | null,
  ): Promise<void> {
    if (folderId === null) return;
    const folders = await daos.folders.listOfCampaign(campaignId);
    new SheetItemBo(campaignId).requireFolder(
      folders.map(({ id }) => id),
      folderId,
    );
  }

  private async view({ daos, sheet, place, rules }: SheetScope): Promise<SheetResponseDto> {
    const template = await this.templateOf(daos, sheet.campaignId, sheet.templateId);
    return { sheet: toSheetDto(sheet, place, rules), template: toSheetTemplateCodeDto(template) };
  }

  private async recorded(
    daos: SheetDaos,
    requester: LibraryRequester,
    access: CampaignAccessBo,
    command: ReceiptCommand,
    saved: Saved,
  ): Promise<Applied<SheetWriteResponseDto>> {
    const receipt = toSheetReceiptDto(command.actionId, saved.sheet, command.operation);
    await this.record(daos, requester, receipt, command.fingerprint);
    const place = await this.deps.holders.placeOfSheet(daos, saved.sheet);
    const sheet = toSheetDto(saved.sheet, place, toSheetAccessBo(access, saved.sheet, place));
    const changed = { sheetId: saved.sheet.id, version: saved.sheet.version };
    return { value: { sheet, receipt }, changed, library: true, characters: saved.characters };
  }

  /** An action already applied: reauthorized and answered with the current sheet. */
  private async replay(
    daos: SheetDaos,
    access: CampaignAccessBo,
    receipt: SheetReceiptDto,
  ): Promise<Applied<SheetWriteResponseDto>> {
    const { sheet, place, rules } = await this.scopeOf(daos, access, receipt.sheetId);
    const value = { sheet: toSheetDto(sheet, place, rules), receipt };
    return { value, changed: null, library: false, characters: null };
  }

  /** The receipt of an action already applied with the same command, or null for a new one. */
  private async previous(
    daos: SheetDaos,
    requester: LibraryRequester,
    actionId: string,
    fingerprint: string,
  ): Promise<SheetReceiptDto | null> {
    const found = await daos.sheets.action(requester.campaignId, requester.userId, actionId);
    if (!found) return null;
    if (found.fingerprint !== fingerprint) throw new SheetActionReusedError(actionId);
    return sheetReceiptDto.parse(found.receipt);
  }

  private async record(
    daos: SheetDaos,
    requester: LibraryRequester,
    receipt: SheetReceiptDto,
    fingerprint: string,
  ): Promise<void> {
    const { campaignId, userId } = requester;
    const { actionId, operation } = receipt;
    await daos.sheets.recordAction({
      campaignId,
      userId,
      actionId,
      operation,
      fingerprint,
      receipt,
    });
  }

  /** Publishes only for an applied command, after its commit: the sheet's version, the library,
   *  then the characters whose main sheet changed. */
  private published<T>(campaignId: string, result: Applied<T>): T {
    const { clock, characterPublisher: publisher } = this.deps;
    const at = clock.now().toISOString();
    if (result.changed) this.deps.publisher.sheetChanged({ campaignId, ...result.changed, at });
    if (result.library) this.deps.library.libraryChanged({ campaignId, at });
    const { characters: saved } = result;
    const version = saved?.version ?? null;
    publishCharactersChange({ publisher, clock }, campaignId, version, saved?.rows ?? []);
    return result.value;
  }
}
