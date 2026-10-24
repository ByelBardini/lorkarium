export type LibraryErrorCode =
  'FOLDER_NOT_FOUND' | 'FOLDER_CYCLE' | 'FOLDER_TOO_DEEP' | 'SCENE_IS_ACTIVE';

/** Every refusal of the scene library of its own; the edge turns `code` into the HTTP status. */
export class LibraryError extends Error {
  constructor(
    readonly code: LibraryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LibraryError';
  }
}

// Also for a folder of another table: telling them apart leaks which ids exist (§2.6).
export class FolderNotFoundError extends LibraryError {
  constructor(
    readonly campaignId: string,
    readonly folderId: string,
  ) {
    super('FOLDER_NOT_FOUND', `campaign ${campaignId} has no scene folder ${folderId}`);
  }
}

export class FolderCycleError extends LibraryError {
  constructor(
    readonly folderId: string,
    readonly parentId: string,
  ) {
    super(
      'FOLDER_CYCLE',
      `scene folder ${folderId} cannot move into ${parentId}, which is itself or inside it; expected a folder outside its subtree or the root`,
    );
  }
}

export class FolderTooDeepError extends LibraryError {
  constructor(
    readonly folder: string,
    readonly depth: number,
    readonly maxDepth: number,
  ) {
    super(
      'FOLDER_TOO_DEEP',
      `${folder} would be ${depth} levels deep; expected at most ${maxDepth}`,
    );
  }
}

// The group needs somewhere to stand: the master activates another grid first.
export class SceneIsActiveError extends LibraryError {
  constructor(
    readonly campaignId: string,
    readonly sceneId: string,
  ) {
    super(
      'SCENE_IS_ACTIVE',
      `scene ${sceneId} is the group grid of campaign ${campaignId}; expected another grid to be activated before deleting it`,
    );
  }
}
