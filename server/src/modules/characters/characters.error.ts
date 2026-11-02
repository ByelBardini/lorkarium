export type CharacterErrorCode = 'CHARACTER_NOT_FOUND' | 'BAR_NOT_FOUND';

/** Every character refusal of its own; the gateway turns `code` into the ack error. */
export class CharacterError extends Error {
  constructor(
    readonly code: CharacterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CharacterError';
  }
}

// Also for a character of another table or one this viewer does not see (its player is a
// spectator or left): telling them apart leaks which ids exist (§2.6).
export class CharacterNotFoundError extends CharacterError {
  constructor(
    readonly campaignId: string,
    readonly characterId: string,
  ) {
    super(
      'CHARACTER_NOT_FOUND',
      `campaign ${campaignId} has no character ${characterId} in table characters that this member sees`,
    );
  }
}

export class CharacterBarNotFoundError extends CharacterError {
  constructor(
    readonly characterId: string,
    readonly barId: string,
  ) {
    super('BAR_NOT_FOUND', `character ${characterId} has no bar ${barId}`);
  }
}
