export type CharacterErrorCode = 'CHARACTER_NOT_FOUND' | 'BAR_NOT_FOUND' | 'ASSET_NOT_FOUND';

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

// ASSET_NOT_FOUND even for an image of the table sent for another purpose: a protected one (a
// document's or a sheet's image) must not tell this member that it exists.
export class CharacterPortraitNotFoundError extends CharacterError {
  constructor(
    readonly campaignId: string,
    readonly characterId: string,
    readonly assetId: string,
    readonly purpose: string | null,
  ) {
    const found =
      purpose === null ? `no asset of campaign ${campaignId}` : `an asset of purpose ${purpose}`;
    super(
      'ASSET_NOT_FOUND',
      `asset ${assetId} cannot be the portrait of character ${characterId}: expected an asset of campaign ${campaignId} with purpose token; found ${found}`,
    );
  }
}
