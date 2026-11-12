import {
  emptySheetTemplateManifest,
  SHEET_TEMPLATE_ASSETS_MAX_BYTES,
  UNNAMED_SHEET_TEMPLATE_NAME,
  type CreateSheetTemplateRequestDto,
  type PlanLimits,
  type SheetTemplateDto,
  type SheetTemplateManifestDto,
  type UpdateSheetTemplateRequestDto,
} from '@lorkarium/contracts';
import type { AssetsDao } from '../assets/assets.dao';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { CampaignsDao } from '../campaigns/campaigns.dao';
import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { memberAccessOf, viewerAccessOf } from '../campaigns/member-access';
import type { SceneFoldersDao } from '../library/scene-folders.dao';
import type { LibraryPublisherPort } from '../library/library-publisher.port';
import type { LibraryRequester } from '../library/library.service';
import { effectiveLimitsOf, PlanLimitsBo } from '../plans/plan-limits.bo';
import { SheetTemplateAssetBo } from './sheet-template-asset.bo';
import { SheetTemplateBo } from './sheet-template.bo';
import type { SheetTemplatesDao } from './sheet-templates.dao';
import { toSheetTemplateChangesPo, toSheetTemplateDto } from './sheet-templates.mapper';
import type { SheetTemplatePo } from './sheet-templates.po';
import { SheetTemplateNotFoundError } from './sheets.error';

/** How many sheets run a template (the sheets of the table, by `token_sheets`). */
export type TemplateUseCounter = Readonly<{
  countOfTemplate(campaignId: string, templateId: string): Promise<number>;
}>;

export type SheetTemplateDaos = Readonly<{
  campaigns: Pick<CampaignsDao, 'lockWithOwner'>;
  folders: Pick<SceneFoldersDao, 'listOfCampaign'>;
  templates: Pick<
    SheetTemplatesDao,
    'findInCampaign' | 'countOfCampaign' | 'insert' | 'update' | 'delete'
  >;
  uses: TemplateUseCounter;
  assets: Pick<AssetsDao, 'findManyInCampaign'>;
}>;

export type SheetTemplatesServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  read: Pick<SheetTemplateDaos, 'templates'>;
  transaction: <T>(work: (daos: SheetTemplateDaos) => Promise<T>) => Promise<T>;
  clock: ClockPort;
  publisher: Pick<LibraryPublisherPort, 'libraryChanged'>;
}>;

/** What a write works with: the DAOs of its transaction, the author's rules and the limits of the
 *  owner's plan, read under the table's lock. */
type TemplateEdit = Readonly<{
  daos: SheetTemplateDaos;
  rules: SheetTemplateBo;
  limits: PlanLimits;
}>;

/** The sheet templates of the library: only masters read or write them. Every write locks the
 *  table (like the library), commits, and only then tells it `library:changed`. Creating one (the
 *  import of a `.lksheet` too) counts against the owner's plan (`sheetTemplates`).
 *
 *  Example: `await templates.create({ userId, campaignId }, { name: 'Ficha Tormenta', files })` */
export class SheetTemplatesService {
  constructor(private readonly deps: SheetTemplatesServiceDeps) {}

  async get(requester: LibraryRequester, templateId: string): Promise<SheetTemplateDto> {
    const access = await viewerAccessOf(this.deps.members, requester.campaignId, requester.userId);
    new SheetTemplateBo(access).requireAuthor(`read sheet template ${templateId}`);
    return toSheetTemplateDto(await this.templateOf(this.deps.read, requester, templateId));
  }

  async create(
    requester: LibraryRequester,
    input: CreateSheetTemplateRequestDto,
  ): Promise<SheetTemplateDto> {
    return this.edit(requester, 'create a sheet template', async ({ daos, rules, limits }) => {
      const stored = await daos.templates.countOfCampaign(requester.campaignId);
      PlanLimitsBo.requireRoom('sheetTemplates', stored, 1, limits);
      const folderId = input.folderId ?? null;
      await this.requireFolder(daos, rules, requester, folderId);
      const { files } = input;
      if (input.manifest) await requireManifestAssets(daos, requester, input.manifest);
      const name = input.name ?? UNNAMED_SHEET_TEMPLATE_NAME;
      const manifest = input.manifest ?? emptySheetTemplateManifest();
      const { campaignId, userId } = requester;
      const row = { campaignId, folderId, name, files, manifest, createdBy: userId };
      return toSheetTemplateDto(await daos.templates.insert(row));
    });
  }

  /** Renames, moves or replaces the files or the manifest; refused when another master saved after the version
   *  read (SHEET_TEMPLATE_VERSION_CONFLICT). Every save bumps the version. */
  async update(
    requester: LibraryRequester,
    templateId: string,
    input: UpdateSheetTemplateRequestDto,
  ): Promise<SheetTemplateDto> {
    return this.edit(requester, `edit sheet template ${templateId}`, async ({ daos, rules }) => {
      const found = await this.templateOf(daos, requester, templateId);
      rules.requireVersion(found, input.expectedVersion);
      if (input.folderId !== undefined)
        await this.requireFolder(daos, rules, requester, input.folderId);
      if (input.manifest) await requireManifestAssets(daos, requester, input.manifest);
      const changes = toSheetTemplateChangesPo(input);
      const saved = await daos.templates.update(requester.campaignId, templateId, {
        ...changes,
        version: found.version + 1,
        updatedAt: this.deps.clock.now(),
      });
      return toSheetTemplateDto(saved);
    });
  }

  /** Refused while a sheet still runs it (SHEET_TEMPLATE_IN_USE): no cascade over the values. */
  async delete(requester: LibraryRequester, templateId: string): Promise<void> {
    await this.edit(requester, `delete sheet template ${templateId}`, async ({ daos, rules }) => {
      const found = await this.templateOf(daos, requester, templateId);
      rules.requireUnused(found, await daos.uses.countOfTemplate(requester.campaignId, found.id));
      await daos.templates.delete(requester.campaignId, templateId);
    });
  }

  private async edit<T>(
    requester: LibraryRequester,
    action: string,
    work: (edit: TemplateEdit) => Promise<T>,
  ): Promise<T> {
    const { campaignId, userId } = requester;
    const rules = new SheetTemplateBo(await memberAccessOf(this.deps.members, campaignId, userId));
    rules.requireAuthor(action);
    const value = await this.deps.transaction(async (daos) => {
      const table = await daos.campaigns.lockWithOwner(campaignId);
      if (!table) throw new CampaignNotFoundError(requester);
      return work({ daos, rules, limits: effectiveLimitsOf(table.owner) });
    });
    this.deps.publisher.libraryChanged({ campaignId, at: this.deps.clock.now().toISOString() });
    return value;
  }

  private async templateOf(
    daos: Pick<SheetTemplateDaos, 'templates'>,
    requester: LibraryRequester,
    templateId: string,
  ): Promise<SheetTemplatePo> {
    const found = await daos.templates.findInCampaign(requester.campaignId, templateId);
    if (!found) throw new SheetTemplateNotFoundError(requester.campaignId, templateId);
    return found;
  }

  private async requireFolder(
    daos: SheetTemplateDaos,
    rules: SheetTemplateBo,
    requester: LibraryRequester,
    folderId: string | null,
  ): Promise<void> {
    if (folderId === null) return;
    const folders = await daos.folders.listOfCampaign(requester.campaignId);
    rules.requireFolder(
      folders.map(({ id }) => id),
      folderId,
    );
  }
}

// Under the table's lock with the rest of the save: an asset of another table, of another purpose
// or missing refuses the whole save.
async function requireManifestAssets(
  daos: SheetTemplateDaos,
  requester: LibraryRequester,
  manifest: SheetTemplateManifestDto,
): Promise<void> {
  const ids = [...new Set(manifest.assets.map(({ assetId }) => assetId))];
  const stored = await daos.assets.findManyInCampaign(requester.campaignId, ids);
  const rules = new SheetTemplateAssetBo(requester.campaignId, SHEET_TEMPLATE_ASSETS_MAX_BYTES);
  rules.requireDeclared(manifest.assets, stored);
}
