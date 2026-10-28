import { TOKEN_LIMIT_CODE } from '@lorkarium/contracts';
export type TokenErrorCode =
  | 'TOKEN_NOT_FOUND'
  | 'OUT_OF_SCENE'
  | 'INVALID_CONTROLLER'
  | 'BAR_NOT_FOUND'
  | 'WALL_BLOCKED'
  | 'CHARACTER_ALREADY_PLACED'
  | 'TOKEN_NOT_LINKED'
  | 'NO_FREE_CELLS'
  | 'TOKEN_FORM_NOT_FOUND'
  | typeof TOKEN_LIMIT_CODE;

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

export class TokenLimitError extends TokenError {
  constructor(
    readonly stored: number,
    readonly adding: number,
    readonly limit: number,
  ) {
    super(
      TOKEN_LIMIT_CODE,
      `the scene would have ${stored + adding} tokens (${stored} stored + ${adding} added); the limit is ${limit}`,
    );
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

export type CenterRef = Readonly<{ x: number; y: number }>;

/** A player's token whose path meets a wall that bars movement (the master passes every wall). */
export class WallBlockedError extends TokenError {
  constructor(
    readonly tokenId: string,
    readonly from: CenterRef,
    readonly to: CenterRef,
    readonly wallId: string,
  ) {
    super(
      'WALL_BLOCKED',
      `token ${tokenId} is barred on (${from.x}, ${from.y}) → (${to.x}, ${to.y}) by wall ${wallId}`,
    );
  }
}

/** A link that would give a character two tokens in one grid, or make a character of a token
 *  that already is one. */
export class CharacterAlreadyPlacedError extends TokenError {
  constructor(
    readonly tokenId: string,
    readonly placedTokenId: string,
    readonly memberId: string | null,
  ) {
    const whose = memberId ? `the character of member ${memberId}` : 'a character';
    super(
      'CHARACTER_ALREADY_PLACED',
      `token ${tokenId} cannot become ${whose}: token ${placedTokenId} of the same grid already is one; expected one token per character in a grid`,
    );
  }
}

/** An unlink of a token that is no character's. */
export class TokenNotLinkedError extends TokenError {
  constructor(readonly tokenId: string) {
    super(
      'TOKEN_NOT_LINKED',
      `token ${tokenId} is linked to no card; expected a token linked to a character`,
    );
  }
}

/** "Adicionar jogadores" in a grid without room around the center for every character. */
export class NoFreeCellsError extends TokenError {
  constructor(
    readonly sceneId: string,
    readonly missing: number,
    readonly wanted: number,
  ) {
    super(
      'NO_FREE_CELLS',
      `scene ${sceneId} has no free cells for ${missing} of the ${wanted} characters to add; expected room around the center for every one`,
    );
  }
}

/** A form switch to a form the token (or its anchor) does not keep. */
export class TokenFormNotFoundError extends TokenError {
  constructor(
    readonly tokenId: string,
    readonly formId: string,
  ) {
    super(
      'TOKEN_FORM_NOT_FOUND',
      `token ${tokenId} has no form ${formId}; expected the id of one of its forms`,
    );
  }
}
