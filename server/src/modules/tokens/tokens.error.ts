export type TokenErrorCode =
  'TOKEN_NOT_FOUND' | 'OUT_OF_SCENE' | 'INVALID_CONTROLLER' | 'BAR_NOT_FOUND';

/** Every token refusal of its own; the gateway turns `code` into the ack error. */
export class TokenError extends Error {
  constructor(
    readonly code: TokenErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TokenError';
  }
}

// Also for a token of another table: telling them apart leaks which ids exist (§2.6).
export class TokenNotFoundError extends TokenError {
  constructor(
    readonly campaignId: string,
    readonly tokenId: string,
  ) {
    super('TOKEN_NOT_FOUND', `campaign ${campaignId} has no token ${tokenId} in its scene`);
  }
}

export class BarNotFoundError extends TokenError {
  constructor(
    readonly tokenId: string,
    readonly barId: string,
  ) {
    super('BAR_NOT_FOUND', `token ${tokenId} has no bar ${barId}`);
  }
}

export type CellRef = Readonly<{ col: number; row: number }>;

export type SizeRef = Readonly<{ width: number; height: number }>;

export type SceneCells = Readonly<{ widthCells: number; heightCells: number }>;

export class OutOfSceneError extends TokenError {
  constructor(
    readonly cell: CellRef,
    readonly size: SizeRef,
    readonly scene: SceneCells,
  ) {
    super(
      'OUT_OF_SCENE',
      `a token at (${cell.col}, ${cell.row}) of size ${size.width}×${size.height} does not fit the ${scene.widthCells}×${scene.heightCells} scene`,
    );
  }
}

export class InvalidControllerError extends TokenError {
  constructor(readonly userIds: readonly string[]) {
    super(
      'INVALID_CONTROLLER',
      `controllers must be members of the table; not members: ${userIds.join(', ')}`,
    );
  }
}
