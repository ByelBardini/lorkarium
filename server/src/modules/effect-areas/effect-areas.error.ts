import type { SceneSize } from '@lorkarium/game-core';

export type EffectAreaErrorCode = 'EFFECT_AREA_NOT_FOUND' | 'EFFECT_AREA_LIMIT' | 'OUT_OF_SCENE';

/** Every area-of-effect refusal of its own; the gateway turns `code` into the ack error. */
export class EffectAreaError extends Error {
  constructor(
    readonly code: EffectAreaErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EffectAreaError';
  }
}

// Also for an area of another table: telling them apart leaks which ids exist (§2.6).
export class EffectAreaNotFoundError extends EffectAreaError {
  constructor(
    readonly campaignId: string,
    readonly effectAreaId: string,
  ) {
    super(
      'EFFECT_AREA_NOT_FOUND',
      `campaign ${campaignId} has no effect area ${effectAreaId} in its scene`,
    );
  }
}

export class EffectAreaLimitError extends EffectAreaError {
  constructor(
    readonly stored: number,
    readonly adding: number,
    readonly limit: number,
  ) {
    super(
      'EFFECT_AREA_LIMIT',
      `the scene has ${stored} effect areas; adding ${adding} passes the limit of ${limit}`,
    );
  }
}

// Same code as the token's and the drawing's: the client says the same "out of the scene".
export class EffectAreaOutOfSceneError extends EffectAreaError {
  constructor(
    readonly origin: Readonly<{ x: number; y: number }>,
    readonly scene: SceneSize,
  ) {
    super(
      'OUT_OF_SCENE',
      `an effect area born at (${origin.x}, ${origin.y}) is outside the ${scene.widthCells}×${scene.heightCells} scene; expected its origin within it`,
    );
  }
}
