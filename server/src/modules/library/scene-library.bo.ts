import type { GridVisibility, SceneAccessBo } from '../scenes/scene-access.bo';
import {
  FolderCycleError,
  FolderNotFoundError,
  FolderTooDeepError,
  SceneIsActiveError,
} from './library.error';

/** Where a folder sits in the tree (`parentId: null` = the root). */
export type LibraryFolderState = Readonly<{ id: string; parentId: string | null }>;

/** Where a grid sits in the tree and who may see it (`folderId: null` = no folder). */
export type LibrarySceneState = Readonly<{
  id: string;
  folderId: string | null;
  visibility: GridVisibility;
}>;

export type LibraryState<F, S> = Readonly<{
  campaignId: string;
  activeSceneId: string | null;
  /** `SCENE_FOLDER_DEPTH_MAX`, passed in: the BO does not read the contract. */
  maxFolderDepth: number;
  folders: readonly F[];
  scenes: readonly S[];
}>;

/** What deleting `folderId` lifts to its parent (`parentId: null` = the root). */
export type FolderRemoval = Readonly<{
  folderId: string;
  parentId: string | null;
  childFolderIds: readonly string[];
  sceneIds: readonly string[];
}>;

export type VisibleLibrary<F, S> = Readonly<{ folders: readonly F[]; scenes: readonly S[] }>;

/** The name of a grid's copy: `name` + `suffix`, the name cut (and its trailing spaces dropped)
 *  so the whole fits in `maxLength`.
 *
 *  Example: `sceneCopyName('Salão do Sino', ' (cópia)', 60) // 'Salão do Sino (cópia)'` */
export function sceneCopyName(name: string, suffix: string, maxLength: number): string {
  const room = Math.max(0, maxLength - suffix.length);
  return `${name.slice(0, room).trimEnd()}${suffix}`;
}

/** The rules of one table's folder tree: no cycle, at most `maxFolderDepth` levels (a root
 *  folder is level 1), a deleted folder lifts its content to the parent, the group grid stays,
 *  and what a player sees. Folders and grids keep any extra field they come with.
 *
 *  Example: `new SceneLibraryBo({ campaignId, activeSceneId, maxFolderDepth: 5, folders, scenes }).requireMove(id, null)` */
export class SceneLibraryBo<
  F extends LibraryFolderState = LibraryFolderState,
  S extends LibrarySceneState = LibrarySceneState,
> {
  private readonly parentOf: ReadonlyMap<string, string | null>;

  constructor(private readonly state: LibraryState<F, S>) {
    this.parentOf = new Map(state.folders.map((folder) => [folder.id, folder.parentId]));
  }

  /** Refuses moving `folderId` under `parentId` (`null` = the root) when it is unknown, would
   *  enter its own subtree or would push the subtree past the depth limit.
   *
   *  Example: `library.requireMove(masmorraId, ato2Id)` */
  requireMove(folderId: string, parentId: string | null): void {
    this.requireFolder(folderId);
    if (parentId !== null) this.requireOutside(folderId, parentId);
    const depth = this.depthOf(parentId) + this.heightOf(folderId);
    this.requireDepth(`scene folder ${folderId}`, depth);
  }

  /** Refuses a new folder under an unknown parent or past the depth limit.
   *
   *  Example: `library.requireCreateIn(null) // the root always fits` */
  requireCreateIn(parentId: string | null): void {
    if (parentId !== null) this.requireFolder(parentId);
    const depth = this.depthOf(parentId) + 1;
    this.requireDepth(`a new scene folder in ${parentId ?? 'the root'}`, depth);
  }

  /** Refuses putting a grid in a folder this table does not have; `null` (the root) passes.
   *  Depth does not matter: a grid is not a level.
   *
   *  Example: `library.requireKnown(input.folderId ?? null)` */
  requireKnown(folderId: string | null): void {
    if (folderId !== null) this.requireFolder(folderId);
  }

  /** What deleting `folderId` lifts to its parent; never a grid deleted.
   *
   *  Example: `library.removal(ato1Id).childFolderIds // the subfolders that go up` */
  removal(folderId: string): FolderRemoval {
    const folder = this.requireFolder(folderId);
    const sceneIds = this.state.scenes.filter((scene) => scene.folderId === folderId);
    return {
      folderId,
      parentId: folder.parentId,
      childFolderIds: this.childrenOf(folderId).map(({ id }) => id),
      sceneIds: sceneIds.map(({ id }) => id),
    };
  }

  /** Refuses deleting the group grid with SCENE_IS_ACTIVE.
   *
   *  Example: `library.requireDeletable(sceneId)` */
  requireDeletable(sceneId: string): void {
    if (sceneId !== this.state.activeSceneId) return;
    throw new SceneIsActiveError(this.state.campaignId, sceneId);
  }

  /** The grids in reach of `access` and the folders that lead to one; the master sees all,
   *  empty folders included.
   *
   *  Example: `library.visibleTo(new SceneAccessBo(access, activeSceneId)).scenes` */
  visibleTo(access: SceneAccessBo): VisibleLibrary<F, S> {
    const { folders, scenes } = this.state;
    if (access.seesEveryGrid()) return { folders, scenes };
    const visibleScenes = scenes.filter((scene) => access.canSee(scene));
    const reached = new Set(visibleScenes.flatMap((scene) => this.chainOf(scene.folderId)));
    return { folders: folders.filter(({ id }) => reached.has(id)), scenes: visibleScenes };
  }

  private requireFolder(folderId: string): F {
    const folder = this.state.folders.find(({ id }) => id === folderId);
    if (folder) return folder;
    throw new FolderNotFoundError(this.state.campaignId, folderId);
  }

  private requireOutside(folderId: string, parentId: string): void {
    this.requireFolder(parentId);
    if (!this.chainOf(parentId).includes(folderId)) return;
    throw new FolderCycleError(folderId, parentId);
  }

  private requireDepth(folder: string, depth: number): void {
    const { maxFolderDepth } = this.state;
    if (depth <= maxFolderDepth) return;
    throw new FolderTooDeepError(folder, depth, maxFolderDepth);
  }

  // The folder and its ancestors up to the root; the bound keeps a corrupt loop from hanging.
  private chainOf(folderId: string | null): string[] {
    const chain: string[] = [];
    for (let id = folderId; id !== null && chain.length <= this.parentOf.size;) {
      chain.push(id);
      id = this.parentOf.get(id) ?? null;
    }
    return chain;
  }

  private depthOf(folderId: string | null): number {
    return this.chainOf(folderId).length;
  }

  private heightOf(folderId: string): number {
    const heights = this.childrenOf(folderId).map(({ id }) => this.heightOf(id));
    return 1 + Math.max(0, ...heights);
  }

  private childrenOf(folderId: string): F[] {
    return this.state.folders.filter((folder) => folder.parentId === folderId);
  }
}
