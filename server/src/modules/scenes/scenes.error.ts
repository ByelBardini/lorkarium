export type SceneErrorCode = 'SCENE_NOT_FOUND';

/** Every refusal about reaching a grid (scene); the edges turn `code` into the reply. */
export class SceneError extends Error {
  constructor(
    readonly code: SceneErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SceneError';
  }
}

// Also for a private grid the player may not reach: telling them apart leaks which grids exist
// (critério 14), so it is never FORBIDDEN.
export class SceneNotFoundError extends SceneError {
  constructor(
    readonly campaignId: string,
    readonly sceneId: string,
    readonly userId: string,
  ) {
    super(
      'SCENE_NOT_FOUND',
      `user ${userId} has no grid ${sceneId} in campaign ${campaignId}; expected the group grid, a public grid or the master role`,
    );
  }
}
