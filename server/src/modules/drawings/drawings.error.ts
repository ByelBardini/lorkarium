import type { DrawingBox, SceneSize } from '@lorkarium/game-core';

export type DrawingErrorCode = 'DRAWING_NOT_FOUND' | 'DRAWING_LIMIT' | 'OUT_OF_SCENE';

/** Every drawing refusal of its own; the gateway turns `code` into the ack error. */
export class DrawingError extends Error {
  constructor(
    readonly code: DrawingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DrawingError';
  }
}

// Also for a drawing of another table: telling them apart leaks which ids exist (§2.6).
export class DrawingNotFoundError extends DrawingError {
  constructor(
    readonly campaignId: string,
    readonly drawingId: string,
  ) {
    super('DRAWING_NOT_FOUND', `campaign ${campaignId} has no drawing ${drawingId} in its scene`);
  }
}

export class DrawingLimitError extends DrawingError {
  constructor(
    readonly stored: number,
    readonly adding: number,
    readonly limit: number,
  ) {
    super(
      'DRAWING_LIMIT',
      `the scene has ${stored} drawings; adding ${adding} passes the limit of ${limit}`,
    );
  }
}

// Same code as the token's: the client tells the player the same "out of the scene".
export class DrawingOutOfSceneError extends DrawingError {
  constructor(
    readonly box: DrawingBox,
    readonly scene: SceneSize,
  ) {
    super(
      'OUT_OF_SCENE',
      `a drawing at (${box.x}, ${box.y}) of ${box.width}×${box.height} does not fit the ${scene.widthCells}×${scene.heightCells} scene`,
    );
  }
}
