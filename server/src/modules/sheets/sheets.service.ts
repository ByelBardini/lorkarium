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
import type { CampaignsDao } from '../campaigns/campaigns.dao';
import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { viewerAccessOf } from '../campaigns/member-access';
import { commandFingerprint } from '../documents/document-writes.service';
import type { LibraryPublisherPort } from '../library/library-publisher.port';
import type { LibraryRequester } from '../library/library.service';
import type { SceneFoldersDao } from '../library/scene-folders.dao';
import { TokenNotFoundError } from '../tokens/tokens.error';
import type { SheetAccessBo } from './sheet-access.bo';
import type {
  CreatedAnchor,
  ResolvedHolder,
  SheetHolderDaos,
  SheetHolderService,
} from './sheet-holder.service';
import { SheetItemBo } from './sheet-item.bo';
import type { SheetPublisherPort } from './sheet-publisher.port';
import type { SheetTemplatesDao } from './sheet-templates.dao';
import { toSheetTemplateCodeDto } from './sheet-templates.mapper';
import type { SheetTemplatePo } from './sheet-templates.po';
import type { SheetsDao, TokenPlacePo } from './sheets.dao';
import {
  SheetActionReusedError,
  SheetNotFoundError,
  SheetTemplateNotFoundError,
} from './sheets.error';
import {
  readableSheetSummaries,
  toSheetAccessBo,
  toSheetChangesPo,
  toSheetDto,
  toSheetReceiptDto,
  toValuesChange,
} from './sheets.mapper';
import type { SheetPo } from './sheets.po';

export type SheetDaos = SheetHolderDaos &
  Readonly<{
    campaigns: Pick<CampaignsDao, 'lockById'>;
    sheets: Pick<
      SheetsDao,
      | 'find'
      | 'listOfToken'
      | 'insert'
      | 'patchValues'
      | 'update'
      | 'delete'
      | 'placeOf'
      | 'placesOf'
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
  holders: SheetHolderService;
}>;

/** One sheet loaded for a command: the row, its token's place and what the requester may do. */
type SheetScope = Readonly<{
  daos: SheetDaos;
  sheet: SheetPo;
  place: TokenPlacePo | null;
  rules: SheetAccessBo;
}>;
/** What a transaction answers and what to tell after the commit: the sheet's new version, whether
 *  its library line changed, and the anchor a player's sheet created. */
type Applied<T> = Readonly<{
  value: T;
  changed: Readonly<{ sheetId: string; version: number }> | null;
  library: boolean;
  created: CreatedAnchor | null;
}>;
/** The receipt a write gets: which action, its fingerprint and what it did. */
type ReceiptCommand = Readonly<{
  actionId: string;
  fingerprint: string;
  operation: SheetReceiptDto['operation'];
}>;
type Saved = Readonly<{ sheet: SheetPo; created: CreatedAnchor | null }>;
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

/** The sheets of the library: read, create (nobody's, a token's or a player's), write values,
 *  manage and delete. Every write locks the table, keeps an idempotent receipt per `actionId`,
 *  commits, and only then tells the table `sheet:changed` (without values) and, when the library
 *  line changed, `library:changed`.
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

  /** The sheets of a token the reader may read: a linked token's are its anchor's. A token of
   *  another table is TOKEN_NOT_FOUND. */
  async listOfToken(requester: LibraryRequester, tokenId: string): Promise<TokenSheetsResponseDto> {
    const { campaignId, userId } = requester;
    return this.deps.snapshot(async (daos) => {
      const access = await viewerAccessOf(daos.members, campaignId, userId);
      const holder = await this.deps.holders.resolve(daos, campaignId, { tokenId });
      if (!holder.place) throw new TokenNotFoundError(campaignId, tokenId);
      const sheets = await daos.sheets.listOfToken(campaignId, holder.place.tokenId);
      return { sheets: readableSheetSummaries(access, sheets, [holder.place]) };
    });
  }

  /** A sheet of `templateId` in the library (master only): nobody's, a token's (a linked one's
   *  goes to its anchor) or a player's (their character's anchor, created when missing). */
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
    const sheet = await daos.sheets.insert({
      ...{ campaignId, templateId: input.templateId, name: input.name, folderId },
      tokenId: holder.place?.tokenId ?? null,
      visibility: input.visibility ?? 'controllers',
    });
    return { sheet, created: holder.created };
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
      return { sheet: saved, created: null };
    });
  }

  /** Renames, moves, gives (or takes from its holder), changes the visibility or the template of
   *  a sheet (master only). */
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
      const saved = await daos.sheets.update(campaignId, sheetId, {
        ...toSheetChangesPo(input, holder?.place ?? null),
        version: sheet.version + 1,
        updatedAt: this.deps.clock.now(),
      });
      return { sheet: saved, created: holder?.created ?? null };
    });
  }

  private async holderChangeOf(
    daos: SheetDaos,
    campaignId: string,
    input: UpdateSheetRequestDto,
  ): Promise<ResolvedHolder | undefined> {
    if (input.holder === undefined) return undefined;
    return this.deps.holders.resolve(daos, campaignId, input.holder);
  }

  /** Master only; a repeated `actionId` does nothing again. */
  async delete(
    requester: LibraryRequester,
    sheetId: string,
    input: DeleteSheetRequestDto,
  ): Promise<void> {
    const result = await this.deps.transaction(async (daos): Promise<Applied<void>> => {
      const access = await this.lockedAccess(daos, requester);
      const fingerprint = commandFingerprint('sheet-delete', sheetId, input);
      if (await this.previous(daos, requester, input.actionId, fingerprint))
        return { value: undefined, changed: null, library: false, created: null };
      const { sheet, rules } = await this.scopeOf(daos, access, sheetId);
      rules.requireManage('delete');
      await daos.sheets.delete(requester.campaignId, sheetId);
      const gone = { id: sheet.id, version: sheet.version + 1 };
      const receipt = toSheetReceiptDto(input.actionId, gone, 'delete');
      await this.record(daos, requester, receipt, fingerprint);
      const changed = { sheetId, version: gone.version };
      return { value: undefined, changed, library: true, created: null };
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
    const place = await this.placeOfSheet(daos, sheet);
    const rules = toSheetAccessBo(access, sheet, place);
    rules.requireRead();
    return { daos, sheet, place, rules };
  }

  private async placeOfSheet(daos: SheetDaos, sheet: SheetPo): Promise<TokenPlacePo | null> {
    if (!sheet.tokenId) return null;
    const place = await daos.sheets.placeOf(sheet.campaignId, sheet.tokenId);
    if (!place) throw new Error(`Sheet ${sheet.id} hangs on token ${sheet.tokenId}, not found`);
    return place;
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
    const place = await this.placeOfSheet(daos, saved.sheet);
    const sheet = toSheetDto(saved.sheet, place, toSheetAccessBo(access, saved.sheet, place));
    const changed = { sheetId: saved.sheet.id, version: saved.sheet.version };
    return { value: { sheet, receipt }, changed, library: true, created: saved.created };
  }

  /** An action already applied: reauthorized and answered with the current sheet. */
  private async replay(
    daos: SheetDaos,
    access: CampaignAccessBo,
    receipt: SheetReceiptDto,
  ): Promise<Applied<SheetWriteResponseDto>> {
    const { sheet, place, rules } = await this.scopeOf(daos, access, receipt.sheetId);
    const value = { sheet: toSheetDto(sheet, place, rules), receipt };
    return { value, changed: null, library: false, created: null };
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

  /** Publishes only for an applied command, after its commit: the new anchor and its card, the
   *  sheet's version, then the library. */
  private published<T>(campaignId: string, result: Applied<T>): T {
    this.deps.holders.publishCreated(campaignId, result.created);
    const at = this.deps.clock.now().toISOString();
    if (result.changed) this.deps.publisher.sheetChanged({ campaignId, ...result.changed, at });
    if (result.library) this.deps.library.libraryChanged({ campaignId, at });
    return result.value;
  }
}
