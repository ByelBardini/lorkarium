import type {
  SheetTemplateSummaryDto,
  SheetSummaryDto,
  CampaignLibraryDto,
  CreateLibraryImageRequestDto,
  UpdateLibraryImageRequestDto,
  LibraryImageDto,
  ImagePresentationStateDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { AssetsDao } from '../assets/assets.dao';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { CampaignsDao } from '../campaigns/campaigns.dao';
import { editLibraryImages } from './library-image-transaction';
import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { viewerAccessOf } from '../campaigns/member-access';
import { SceneAccessBo } from '../scenes/scene-access.bo';
import type { ScenesDao } from '../scenes/scenes.dao';
import type { SceneFoldersDao } from './scene-folders.dao';
import type { LibraryImagesDao, LibraryImageRow } from './library-images.dao';
import type { ImagePresentationsDao } from './image-presentations.dao';
import type { LibraryRequester } from './library.service';
import type { LibraryPublisherPort } from './library-publisher.port';
import { requireLibraryImageAsset } from './library-image.bo';
import { LibraryImageNotFoundError } from './library-image.error';
import { toLibraryImageDto, toImagePresentationState } from './library-image.mapper';
import { toLibrarySceneDto, toSceneFolderDto } from './library.mapper';
import { SceneLibraryBo } from './scene-library.bo';
import { DocumentAccessBo } from '../documents/document-access.bo';
import { toDocumentSummary } from '../documents/documents.mapper';
import type { DocumentsDao } from '../documents/documents.dao';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { SheetTemplatesDao } from '../sheets/sheet-templates.dao';
import type { SheetsDao } from '../sheets/sheets.dao';
import { readableSheetSummaries } from '../sheets/sheets.mapper';
import { toSheetTemplateSummaryDto } from '../sheets/sheet-templates.mapper';
export type LibraryImageDaos = Readonly<{
  sheetTemplates?: Pick<SheetTemplatesDao, 'listOfCampaign'>;
  sheets?: Pick<SheetsDao, 'listOfCampaign' | 'holdersOf'>;
  documents?: Pick<DocumentsDao, 'listOfCampaign' | 'ownersOfCampaign'>;
  campaigns: Pick<CampaignsDao, 'lockById' | 'findById'>;
  members: Pick<CampaignMembersDao, 'findMembership'>;
  assets: Pick<AssetsDao, 'findInCampaign'>;
  images: Pick<
    LibraryImagesDao,
    'listOfCampaign' | 'findInCampaign' | 'insert' | 'update' | 'delete' | 'moveFromFolder'
  >;
  presentations: Pick<ImagePresentationsDao, 'findOfCampaign' | 'save'>;
  folders: Pick<SceneFoldersDao, 'listOfCampaign'>;
  scenes: Pick<ScenesDao, 'listOfCampaign'>;
}>;
export type LibraryImageTransaction = <T>(
  work: (daos: LibraryImageDaos) => Promise<T>,
) => Promise<T>;
export type LibraryImageServiceDeps = Readonly<{
  read: LibraryImageDaos;
  transaction: LibraryImageTransaction;
  snapshot: LibraryImageTransaction;
  clock: ClockPort;
  newId: () => string;
  publisher: Pick<LibraryPublisherPort, 'libraryChanged' | 'imagePresentationChanged'>;
  maxFolderDepth: number;
}>;
export class LibraryImageService {
  constructor(private readonly deps: LibraryImageServiceDeps) {}
  async list(requester: LibraryRequester): Promise<CampaignLibraryDto> {
    return this.deps.snapshot(async (daos) => {
      const access = await viewerAccessOf(daos.members, requester.campaignId, requester.userId);
      const campaign = await daos.campaigns.findById(requester.campaignId);
      if (!campaign) throw new CampaignNotFoundError(requester);
      const folders = await daos.folders.listOfCampaign(requester.campaignId);
      const scenes = await daos.scenes.listOfCampaign(requester.campaignId);
      const images = (await daos.images.listOfCampaign(requester.campaignId)).filter(
        (row) => access.isMaster() || row.image.visibility === 'public',
      );
      const tree = new SceneLibraryBo({
        campaignId: requester.campaignId,
        activeSceneId: campaign.activeSceneId,
        maxFolderDepth: this.deps.maxFolderDepth,
        folders,
        scenes,
      });
      const ownerRows = (await daos.documents?.ownersOfCampaign(requester.campaignId)) ?? [];
      const documentRows = (await daos.documents?.listOfCampaign(requester.campaignId)) ?? [];
      const documents = documentRows.flatMap((row) => {
        const owners = ownerRows
          .filter((owner) => owner.documentId === row.id)
          .map((owner) => owner.userId);
        if (!new DocumentAccessBo(access, { ...row, ownerIds: owners }).canRead()) return [];
        return [toDocumentSummary(row, owners, access)];
      });
      const sheets = await sheetsFor(daos, access);
      const visible = tree.visibleTo(new SceneAccessBo(access, campaign.activeSceneId), [
        ...images.map((row) => row.image.folderId),
        ...documents.map((document) => document.folderId),
        ...sheets.map((sheet) => sheet.folderId),
      ]);
      return {
        activeSceneId: campaign.activeSceneId,
        folders: visible.folders.map(toSceneFolderDto),
        scenes: visible.scenes.map((row) => toLibrarySceneDto(row, access.isMaster())),
        images: images.map(toLibraryImageDto),
        documents,
        ...(await sheetTemplatesFor(daos, access)),
        ...(daos.sheets ? { sheets } : {}),
      };
    });
  }
  async create(
    requester: LibraryRequester,
    input: CreateLibraryImageRequestDto,
  ): Promise<LibraryImageDto> {
    const saved = await this.edit(requester, async (daos) => {
      const asset = await daos.assets.findInCampaign(requester.campaignId, input.assetId);
      requireLibraryImageAsset(asset, input.assetId);
      if (
        (await daos.images.listOfCampaign(requester.campaignId)).some(
          (row) => row.asset.id === input.assetId,
        )
      )
        throw new LibraryImageNotFoundError(requester.campaignId, input.assetId);
      await this.requireFolder(daos, requester.campaignId, input.folderId ?? null);
      const image = await daos.images.insert({
        ...input,
        campaignId: requester.campaignId,
        folderId: input.folderId ?? null,
        visibility: input.visibility ?? 'private',
      });
      return toLibraryImageDto(await this.imageOf(daos, requester, image.id));
    });
    this.changed(requester.campaignId);
    return saved;
  }
  async update(
    requester: LibraryRequester,
    imageId: string,
    changes: UpdateLibraryImageRequestDto,
  ): Promise<LibraryImageDto> {
    const saved = await this.edit(requester, async (daos) => {
      await this.imageOf(daos, requester, imageId);
      if (changes.folderId !== undefined)
        await this.requireFolder(daos, requester.campaignId, changes.folderId);
      await daos.images.update(requester.campaignId, imageId, changes);
      return toLibraryImageDto(await this.imageOf(daos, requester, imageId));
    });
    this.changed(requester.campaignId);
    return saved;
  }
  async delete(requester: LibraryRequester, imageId: string): Promise<void> {
    const cleared = await this.edit(requester, async (daos) => {
      await this.imageOf(daos, requester, imageId);
      const current = await daos.presentations.findOfCampaign(requester.campaignId);
      const row =
        current?.imageId === imageId
          ? await daos.presentations.save(requester.campaignId, null, this.deps.clock.now())
          : undefined;
      await daos.images.delete(requester.campaignId, imageId);
      return row ? toImagePresentationState(requester.campaignId, row, undefined) : null;
    });
    if (cleared) this.presented(cleared);
    this.changed(requester.campaignId);
  }
  private async edit<T>(
    requester: LibraryRequester,
    work: (daos: LibraryImageDaos) => Promise<T>,
  ): Promise<T> {
    return editLibraryImages(this.deps, requester, work);
  }
  private async requireFolder(
    daos: LibraryImageDaos,
    campaignId: string,
    folderId: string | null,
  ): Promise<void> {
    const folders = await daos.folders.listOfCampaign(campaignId);
    new SceneLibraryBo({
      campaignId,
      activeSceneId: null,
      maxFolderDepth: this.deps.maxFolderDepth,
      folders,
      scenes: [],
    }).requireKnown(folderId);
  }
  private async imageOf(
    daos: LibraryImageDaos,
    requester: LibraryRequester,
    imageId: string,
  ): Promise<LibraryImageRow> {
    const row = await daos.images.findInCampaign(requester.campaignId, imageId);
    if (!row) throw new LibraryImageNotFoundError(requester.campaignId, imageId);
    return row;
  }
  private changed(campaignId: string): void {
    this.deps.publisher.libraryChanged({ campaignId, at: this.deps.clock.now().toISOString() });
  }
  private presented(state: ImagePresentationStateDto): void {
    this.deps.publisher.imagePresentationChanged({ ...state, eventId: this.deps.newId() });
  }
}
// Only masters get the templates (without their code): it runs on every screen of the table.
async function sheetTemplatesFor(
  daos: LibraryImageDaos,
  access: CampaignAccessBo,
): Promise<{ sheetTemplates?: SheetTemplateSummaryDto[] }> {
  if (!access.isMaster() || !daos.sheetTemplates) return {};
  const rows = await daos.sheetTemplates.listOfCampaign(access.campaignIdOf());
  return { sheetTemplates: rows.map(toSheetTemplateSummaryDto) };
}

// A master gets every sheet; anyone else those they read (by their holder's place and control).
async function sheetsFor(
  daos: LibraryImageDaos,
  access: CampaignAccessBo,
): Promise<SheetSummaryDto[]> {
  if (!daos.sheets) return [];
  const sheets = await daos.sheets.listOfCampaign(access.campaignIdOf());
  const places = await daos.sheets.holdersOf(access.campaignIdOf(), sheets);
  return readableSheetSummaries(access, sheets, places);
}
