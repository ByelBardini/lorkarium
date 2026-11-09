import type { GridVisibility } from '../scenes/scene-access.bo';

export type FolderPrivacyState = Readonly<{
  id: string;
  parentId: string | null;
  visibility: GridVisibility;
}>;

/** Which folders hide their content from who is not a master: a private one and every folder
 *  under it. The same answer the `hiddenByFolderSql` column gives row by row, for what is decided
 *  over a tree already in memory.
 *
 *  Example: `new FolderPrivacyBo(folders).hides(ossuarioId) // true under a private Catacumbas` */
export class FolderPrivacyBo {
  private readonly byId: ReadonlyMap<string, FolderPrivacyState>;

  constructor(folders: readonly FolderPrivacyState[]) {
    this.byId = new Map(folders.map((folder) => [folder.id, folder]));
  }

  /** `null` is the root, which hides nothing; the bound keeps a corrupt loop from hanging.
   *
   *  Example: `privacy.hides(row.folderId)` */
  hides(folderId: string | null): boolean {
    let folder = folderId === null ? undefined : this.byId.get(folderId);
    for (let seen = 0; folder && seen <= this.byId.size; seen += 1) {
      if (folder.visibility === 'private') return true;
      folder = folder.parentId === null ? undefined : this.byId.get(folder.parentId);
    }
    return false;
  }
}
