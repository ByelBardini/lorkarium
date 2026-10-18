import type { DrawingBox, SceneSize } from '@lorkarium/game-core';

export type WallErrorCode =
  | 'WALL_NOT_FOUND'
  | 'WALL_LIMIT'
  | 'INVALID_DOOR'
  | 'DOOR_LOCKED'
  | 'OUT_OF_SCENE'
  | 'WALL_SEGMENT_NOT_FOUND';

/** Every wall refusal of its own; the gateway turns `code` into the ack error. */
export class WallError extends Error {
  constructor(
    readonly code: WallErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WallError';
  }
}

// Also for a wall of another table: telling them apart leaks which ids exist (§2.6).
export class WallNotFoundError extends WallError {
  constructor(
    readonly campaignId: string,
    readonly wallId: string,
  ) {
    super('WALL_NOT_FOUND', `campaign ${campaignId} has no wall ${wallId} in its scene`);
  }
}

export class WallLimitError extends WallError {
  constructor(
    readonly what: 'walls' | 'wall segments',
    readonly total: number,
    readonly limit: number,
  ) {
    super('WALL_LIMIT', `the scene would have ${total} ${what}; expected at most ${limit}`);
  }
}

/** Only a straight wall becomes a door, and only a door opens. */
export class InvalidDoorError extends WallError {
  constructor(
    readonly wallId: string,
    readonly detail: string,
  ) {
    super('INVALID_DOOR', `wall ${wallId} ${detail}`);
  }
}

/** Only the master opens a locked door. */
export class DoorLockedError extends WallError {
  constructor(readonly wallId: string) {
    super('DOOR_LOCKED', `door ${wallId} is locked; only the master unlocks it`);
  }
}

// Same code as the token's and the drawing's: the client tells the master the same thing.
export class WallOutOfSceneError extends WallError {
  constructor(
    readonly box: DrawingBox,
    readonly scene: SceneSize,
  ) {
    super(
      'OUT_OF_SCENE',
      `a wall at (${box.x}, ${box.y}) of ${box.width}×${box.height} does not fit the ${scene.widthCells}×${scene.heightCells} scene`,
    );
  }
}

/** A piece index past the straight pieces the wall is made of. */
export class WallSegmentNotFoundError extends WallError {
  constructor(
    readonly wallId: string,
    readonly segmentIndex: number,
    readonly count: number,
  ) {
    super(
      'WALL_SEGMENT_NOT_FOUND',
      `wall ${wallId} has no segment ${segmentIndex}; expected 0 to ${count - 1}`,
    );
  }
}
