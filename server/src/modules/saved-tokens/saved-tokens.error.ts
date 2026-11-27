export type SavedTokensErrorCode =
  | 'SAVED_TOKEN_NOT_FOUND'
  | 'SAVED_TOKENS_LIMIT'
  | 'SAVED_TOKEN_FOLDER_NOT_FOUND'
  | 'SAVED_TOKEN_FOLDER_NAME_TAKEN'
  | 'SAVED_TOKEN_FOLDERS_LIMIT'
  | 'RATE_LIMITED';

/** Every refusal of the saved tokens of their own; the edge turns `code` into the HTTP status. */
export class SavedTokensError extends Error {
  constructor(
    readonly code: SavedTokensErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SavedTokensError';
  }
}

// Also for a token of someone else or of another table: telling them apart leaks which ids exist.
export class SavedTokenNotFoundError extends SavedTokensError {
  constructor(
    readonly campaignId: string,
    readonly userId: string,
    readonly savedTokenId: string,
  ) {
    super(
      'SAVED_TOKEN_NOT_FOUND',
      `user ${userId} keeps no saved token ${savedTokenId} at campaign ${campaignId}`,
    );
  }
}

export class SavedTokensLimitError extends SavedTokensError {
  constructor(
    readonly wanted: number,
    readonly limit: number,
  ) {
    super(
      'SAVED_TOKENS_LIMIT',
      `saving would keep ${wanted} of ${limit} saved tokens; expected at most ${limit} per member`,
    );
  }
}

// Also for a folder of someone else or of another table, like the token's.
export class SavedTokenFolderNotFoundError extends SavedTokensError {
  constructor(
    readonly campaignId: string,
    readonly userId: string,
    readonly folderId: string,
  ) {
    super(
      'SAVED_TOKEN_FOLDER_NOT_FOUND',
      `user ${userId} keeps no saved token folder ${folderId} at campaign ${campaignId}`,
    );
  }
}

export class SavedTokenFolderNameTakenError extends SavedTokensError {
  constructor(readonly folderName: string) {
    super(
      'SAVED_TOKEN_FOLDER_NAME_TAKEN',
      `a saved token folder named "${folderName}" already exists; expected a name unique per member, ignoring case and accents`,
    );
  }
}

export class SavedTokenFoldersLimitError extends SavedTokensError {
  constructor(
    readonly wanted: number,
    readonly limit: number,
  ) {
    super(
      'SAVED_TOKEN_FOLDERS_LIMIT',
      `saving would keep ${wanted} of ${limit} saved token folders; expected at most ${limit} per member`,
    );
  }
}

export class SavedTokensRateLimitedError extends SavedTokensError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many saved token changes; retry after ${retryAfterSeconds} s`);
  }
}
