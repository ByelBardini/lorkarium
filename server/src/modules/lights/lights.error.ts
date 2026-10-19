import type { SceneSize } from '@lorkarium/game-core';

export type LightErrorCode = 'LIGHT_NOT_FOUND' | 'LIGHT_LIMIT' | 'OUT_OF_SCENE';

/** Every map light refusal of its own; the gateway turns `code` into the ack error. */
export class LightError extends Error {
  constructor(
    readonly code: LightErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LightError';
  }
}

// Also for a light of another table: telling them apart leaks which ids exist (§2.6).
export class LightNotFoundError extends LightError {
  constructor(
    readonly campaignId: string,
    readonly lightId: string,
  ) {
    super('LIGHT_NOT_FOUND', `campaign ${campaignId} has no light ${lightId} in its scene`);
  }
}

export class LightLimitError extends LightError {
  constructor(
    readonly total: number,
    readonly limit: number,
  ) {
    super('LIGHT_LIMIT', `the scene would have ${total} lights; expected at most ${limit}`);
  }
}

// Same code as the token's and the wall's: the client tells the master the same thing.
export class LightOutOfSceneError extends LightError {
  constructor(
    readonly point: Readonly<{ x: number; y: number }>,
    readonly scene: SceneSize,
  ) {
    super(
      'OUT_OF_SCENE',
      `a light at (${point.x}, ${point.y}) does not fit the ${scene.widthCells}×${scene.heightCells} scene`,
    );
  }
}
