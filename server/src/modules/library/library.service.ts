import type { LibraryImagesDao } from './library-images.dao';
import type { DocumentsDao } from '../documents/documents.dao';
import {
  SCENE_COPY_SUFFIX,
  SCENE_NAME_MAX_LENGTH,
  UNNAMED_SCENE_NAME,
  type CreateLibrarySceneRequestDto,
  type CreateSceneFolderRequestDto,
  type LibraryDto,
  type LibrarySceneDto,
  type SceneFolderDto,
  type UpdateLibrarySceneRequestDto,
  type UpdateSceneFolderRequestDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { DrawingsDao } from '../drawings/drawings.dao';
import type { EffectAreasDao } from '../effect-areas/effect-areas.dao';
import type { LightsDao } from '../lights/lights.dao';
import type { TokensDao } from '../tokens/tokens.dao';
import type { WallsDao } from '../walls/walls.dao';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { CampaignsDao } from '../campaigns/campaigns.dao';
import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { memberAccessOf, viewerAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { SceneAccessBo } from '../scenes/scene-access.bo';
import type { GridEviction, SceneAudiencePort } from '../scenes/scene-audience.port';
import type { LibrarySceneRow, ScenesDao } from '../scenes/scenes.dao';
import { SceneNotFoundError } from '../scenes/scenes.error';
import { toSceneDto } from '../scenes/scenes.mapper';
import type { LibraryPublisherPort } from './library-publisher.port';
import { FolderNotFoundError } from './library.error';
import { toLibraryDto, toLibrarySceneDto, toSceneCopyPo, toSceneFolderDto } from './library.mapper';
import { SceneLibraryBo, sceneCopyName } from './scene-library.bo';
import type { SceneFoldersDao } from './scene-folders.dao';
import type { SceneFolderPo } from './scene-folders.po';

type LibraryOfTable = SceneLibraryBo<SceneFolderPo, LibrarySceneRow>;

export type LibraryReadDaos = Readonly<{
  campaigns: Pick<CampaignsDao, 'findById'>;
  folders: Pick<SceneFoldersDao, 'listOfCampaign'>;
  scenes: Pick<ScenesDao, 'listOfCampaign'>;
}>;

export type LibraryWriteDaos = Readonly<{
  documents?: Pick<DocumentsDao, 'moveFromFolder'>;
  images?: Pick<LibraryImagesDao, 'moveFromFolder'>;
  campaigns: Pick<CampaignsDao, 'lockById'>;
  folders: Pick<
    SceneFoldersDao,
    'listOfCampaign' | 'insert' | 'update' | 'moveChildren' | 'delete'
  >;
  scenes: Pick<
    ScenesDao,
    | 'listOfCampaign'
    | 'insert'
    | 'findInCampaign'
    | 'findLibraryRow'
    | 'updateLibrary'
    | 'bumpVersion'
    | 'moveScenes'
    | 'delete'
  >;
}> &
  SceneCopyDaos;

/** What a duplicate copies, one table each: every DAO built with the same `tx`. */
export type SceneCopyDaos = Readonly<{
  tokens: Pick<TokensDao, 'copyScene'>;
  walls: Pick<WallsDao, 'copyScene'>;
  lights: Pick<LightsDao, 'copyScene'>;
  drawings: Pick<DrawingsDao, 'copyScene'>;
  effectAreas: Pick<EffectAreasDao, 'copyScene'>;
}>;

export type LibraryTransactionRunner = <T>(
  work: (daos: LibraryWriteDaos) => Promise<T>,
) => Promise<T>;

export type LibraryServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  read: LibraryReadDaos;
  transaction: LibraryTransactionRunner;
  publisher: Pick<LibraryPublisherPort, 'libraryChanged'>;
  /** Tells whoever has a renamed grid open its new name (`scene:updated`), after the commit. */
  grids: Pick<BoardPublisherPort, 'sceneUpdated'>;
  /** Takes who lost a grid out of its rooms, after the commit. */
  audience: Pick<SceneAudiencePort, 'evict'>;
  clock: ClockPort;
  /** `SCENE_FOLDER_DEPTH_MAX`, passed by the plugin. */
  maxFolderDepth: number;
}>;

/** Who asks and at which table; always from the session and the URL, never from the body. */
export type LibraryRequester = Readonly<{ userId: string; campaignId: string }>;

type LibraryEdit = Readonly<{
  daos: LibraryWriteDaos;
  library: LibraryOfTable;
  groupSceneId: string | null;
}>;

// Who loses a grid by an edit, taken out of its rooms once the edit is committed.
type Eviction = Omit<GridEviction, 'campaignId' | 'at'>;
type EvictingResult<T> = Readonly<{ value: T; eviction: Eviction | null }>;
// A grid edited, with the version a new name bumped it to (`null` when the name stayed).
type SceneEdit = Readonly<{ row: LibrarySceneRow; renamedVersion: number | null }>;

/** The library use cases. Every edit is the master's, runs with the campaign locked (two edits
 *  never decide on the same tree), commits, and only then tells the table `library:changed`.
 *
 *  Example: `await library.createScene({ userId, campaignId }, { folderId: ato1Id })` */
export class LibraryService {
  constructor(private readonly deps: LibraryServiceDeps) {}

  /** What `userId` may see of the library: the master all, a player the public grids, the
   *  group one and the folders that lead to them, without token counts. */
  async list(requester: LibraryRequester): Promise<LibraryDto> {
    const { userId, campaignId } = requester;
    const access = await viewerAccessOf(this.deps.members, campaignId, userId);
    const campaign = await this.deps.read.campaigns.findById(campaignId);
    if (!campaign) throw new CampaignNotFoundError({ campaignId, userId });
    const library = await this.libraryOf(this.deps.read, campaignId, campaign.activeSceneId);
    const visible = library.visibleTo(new SceneAccessBo(access, campaign.activeSceneId));
    return toLibraryDto(campaign.activeSceneId, visible, access.isMaster());
  }

  /** A new private 20×12 grid, named `UNNAMED_SCENE_NAME` when no name comes. */
  async createScene(
    requester: LibraryRequester,
    input: CreateLibrarySceneRequestDto,
  ): Promise<LibrarySceneDto> {
    return this.edit(requester, 'create a grid', async ({ daos, library }) => {
      const folderId = input.folderId ?? null;
      library.requireKnown(folderId);
      const { campaignId } = requester;
      const name = input.name ?? UNNAMED_SCENE_NAME;
      const created = await daos.scenes.insert({ campaignId, name, folderId });
      return this.libraryRowOf(daos, requester, created.id);
    });
  }

  /** Renames, moves or publishes/hides a grid; an absent key stays. Hiding a grid that is not
   *  the group's takes its players out of it (`scene:closed`, reason `private`); a new name bumps
   *  the grid's version and reaches its rooms as `scene:updated` (the tabs and the board say it). */
  async updateScene(
    requester: LibraryRequester,
    sceneId: string,
    changes: UpdateLibrarySceneRequestDto,
  ): Promise<LibrarySceneDto> {
    const action = `edit grid ${sceneId}`;
    const { row, renamedVersion } = await this.editAndEvict(requester, action, (edit) =>
      this.savedSceneEdit(edit, requester, sceneId, changes),
    );
    if (renamedVersion !== null) this.publishRename(requester.campaignId, renamedVersion, row);
    return toLibrarySceneDto(row, true);
  }

  private async savedSceneEdit(
    { daos, library, groupSceneId }: LibraryEdit,
    requester: LibraryRequester,
    sceneId: string,
    changes: UpdateLibrarySceneRequestDto,
  ): Promise<EvictingResult<SceneEdit>> {
    if (changes.folderId !== undefined) library.requireKnown(changes.folderId);
    const saved = await daos.scenes.updateLibrary(requester.campaignId, sceneId, changes);
    if (!saved) throw this.sceneNotFound(requester, sceneId);
    const renamedVersion =
      changes.name === undefined ? null : await daos.scenes.bumpVersion(sceneId);
    const row = await this.sceneRowOf(daos, requester, sceneId);
    const hidden = changes.visibility === 'private' && sceneId !== groupSceneId;
    const eviction = hidden ? ({ sceneId, audience: 'players', reason: 'private' } as const) : null;
    return { value: { row, renamedVersion }, eviction };
  }

  private publishRename(campaignId: string, version: number, row: LibrarySceneRow): void {
    const at = this.deps.clock.now().toISOString();
    const scene = toSceneDto(row);
    this.deps.grids.sceneUpdated({ campaignId, sceneId: row.id, version, at, scene });
  }

  /** Deletes a grid and everything on it; never the group grid (SCENE_IS_ACTIVE). Whoever had
   *  it open as a tab is taken out of it (`scene:closed`, reason `deleted`). */
  async deleteScene(requester: LibraryRequester, sceneId: string): Promise<void> {
    await this.editAndEvict(requester, `delete grid ${sceneId}`, async ({ daos, library }) => {
      library.requireDeletable(sceneId);
      const deleted = await daos.scenes.delete(requester.campaignId, sceneId);
      if (!deleted) throw this.sceneNotFound(requester, sceneId);
      const eviction = { sceneId, audience: 'everyone', reason: 'deleted' } as const;
      return { value: undefined, eviction };
    });
  }

  /** A private copy of the whole grid in the same folder, named "<name> (cópia)": tokens (bars,
   *  control, look, sight, light, conditions), walls, lights, drawings and areas. The combat and
   *  the main token choices stay behind. */
  async duplicate(requester: LibraryRequester, sceneId: string): Promise<LibrarySceneDto> {
    return this.edit(requester, `duplicate grid ${sceneId}`, async ({ daos }) => {
      const source = await daos.scenes.findInCampaign(requester.campaignId, sceneId);
      if (!source) throw this.sceneNotFound(requester, sceneId);
      const name = sceneCopyName(source.name, SCENE_COPY_SUFFIX, SCENE_NAME_MAX_LENGTH);
      const copy = await daos.scenes.insert(toSceneCopyPo(source, name));
      await copySceneContent(daos, source.id, copy.id);
      return this.libraryRowOf(daos, requester, copy.id);
    });
  }

  /** A new folder under `parentId` (the root when absent), at most `maxFolderDepth` deep. */
  async createFolder(
    requester: LibraryRequester,
    input: CreateSceneFolderRequestDto,
  ): Promise<SceneFolderDto> {
    return this.edit(requester, 'create a folder', async ({ daos, library }) => {
      const parentId = input.parentId ?? null;
      library.requireCreateIn(parentId);
      const { campaignId } = requester;
      return toSceneFolderDto(
        await daos.folders.insert({ campaignId, name: input.name, parentId }),
      );
    });
  }

  /** Renames and/or moves a folder; never into its own subtree nor past the depth limit. */
  async updateFolder(
    requester: LibraryRequester,
    folderId: string,
    changes: UpdateSceneFolderRequestDto,
  ): Promise<SceneFolderDto> {
    return this.edit(requester, `edit folder ${folderId}`, async ({ daos, library }) => {
      if (changes.parentId !== undefined) library.requireMove(folderId, changes.parentId);
      const { campaignId } = requester;
      const saved = await daos.folders.update(campaignId, folderId, changes);
      if (!saved) throw new FolderNotFoundError(campaignId, folderId);
      return toSceneFolderDto(saved);
    });
  }

  /** Deletes a folder; its subfolders and grids go up to its parent, and no grid is deleted. */
  async deleteFolder(requester: LibraryRequester, folderId: string): Promise<void> {
    await this.edit(requester, `delete folder ${folderId}`, async ({ daos, library }) => {
      const removal = library.removal(folderId);
      const { campaignId } = requester;
      await daos.folders.moveChildren(campaignId, removal.childFolderIds, removal.parentId);
      await daos.scenes.moveScenes(campaignId, removal.sceneIds, removal.parentId);
      await daos.images?.moveFromFolder(campaignId, folderId, removal.parentId);
      await daos.documents?.moveFromFolder(campaignId, folderId, removal.parentId);
      await daos.folders.delete(campaignId, folderId);
    });
  }

  private async edit<T>(
    requester: LibraryRequester,
    action: string,
    work: (edit: LibraryEdit) => Promise<T>,
  ): Promise<T> {
    return this.editAndEvict(requester, action, async (edit) => {
      return { value: await work(edit), eviction: null };
    });
  }

  // The eviction comes after the commit (an evicted socket that watches again then sees the
  // change) and before `library:changed`, so the evicted read the library already out of it.
  private async editAndEvict<T>(
    requester: LibraryRequester,
    action: string,
    work: (edit: LibraryEdit) => Promise<EvictingResult<T>>,
  ): Promise<T> {
    const { userId, campaignId } = requester;
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster(action);
    const { value, eviction } = await this.deps.transaction(async (daos) => {
      const campaign = await daos.campaigns.lockById(campaignId);
      if (!campaign) throw new CampaignNotFoundError({ campaignId, userId });
      const groupSceneId = campaign.activeSceneId;
      const library = await this.libraryOf(daos, campaignId, groupSceneId);
      return work({ daos, library, groupSceneId });
    });
    const at = this.deps.clock.now().toISOString();
    if (eviction) await this.deps.audience.evict({ ...eviction, campaignId, at });
    this.deps.publisher.libraryChanged({ campaignId, at });
    return value;
  }

  private async libraryOf(
    daos: Pick<LibraryReadDaos, 'folders' | 'scenes'>,
    campaignId: string,
    activeSceneId: string | null,
  ): Promise<LibraryOfTable> {
    const folders = await daos.folders.listOfCampaign(campaignId);
    const scenes = await daos.scenes.listOfCampaign(campaignId);
    const { maxFolderDepth } = this.deps;
    return new SceneLibraryBo({ campaignId, activeSceneId, maxFolderDepth, folders, scenes });
  }

  private async libraryRowOf(
    daos: LibraryWriteDaos,
    requester: LibraryRequester,
    sceneId: string,
  ): Promise<LibrarySceneDto> {
    return toLibrarySceneDto(await this.sceneRowOf(daos, requester, sceneId), true);
  }

  private async sceneRowOf(
    daos: LibraryWriteDaos,
    requester: LibraryRequester,
    sceneId: string,
  ): Promise<LibrarySceneRow> {
    const row = await daos.scenes.findLibraryRow(requester.campaignId, sceneId);
    if (!row) throw this.sceneNotFound(requester, sceneId);
    return row;
  }

  private sceneNotFound(requester: LibraryRequester, sceneId: string): SceneNotFoundError {
    return new SceneNotFoundError(requester.campaignId, sceneId, requester.userId);
  }
}

// One table after the other on the same `tx`; the order is the one the journal of the spec pins.
async function copySceneContent(
  daos: SceneCopyDaos,
  fromSceneId: string,
  toSceneId: string,
): Promise<void> {
  await daos.tokens.copyScene(fromSceneId, toSceneId);
  await daos.walls.copyScene(fromSceneId, toSceneId);
  await daos.lights.copyScene(fromSceneId, toSceneId);
  await daos.drawings.copyScene(fromSceneId, toSceneId);
  await daos.effectAreas.copyScene(fromSceneId, toSceneId);
}
