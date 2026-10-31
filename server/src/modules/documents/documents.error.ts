export type DocumentErrorCode =
  | 'DOCUMENT_NOT_FOUND'
  | 'DOCUMENT_VERSION_CONFLICT'
  | 'DOCUMENT_ACTION_REUSED'
  | 'DOCUMENT_ASSET_NOT_FOUND'
  | 'DOCUMENT_TAB_NOT_FOUND'
  | 'DOCUMENT_TAB_LIMIT'
  | 'DOCUMENT_TAB_LAST';
export class DocumentError extends Error {
  constructor(
    readonly code: DocumentErrorCode,
    detail: string,
  ) {
    super(detail);
    this.name = 'DocumentError';
  }
}
export class DocumentNotFoundError extends DocumentError {
  constructor(campaignId: string, documentId: string) {
    super('DOCUMENT_NOT_FOUND', `Document ${documentId} not readable in campaign ${campaignId}`);
  }
}
export class DocumentVersionConflictError extends DocumentError {
  constructor(documentId: string, expected: number, actual: number) {
    super(
      'DOCUMENT_VERSION_CONFLICT',
      `Document ${documentId} version ${actual}; expected ${expected}`,
    );
  }
}
// Also for a tab the reader cannot see: a hidden tab and a missing one look the same.
export class DocumentTabNotFoundError extends DocumentError {
  constructor(documentId: string, tabId: string) {
    super('DOCUMENT_TAB_NOT_FOUND', `Tab ${tabId} not readable in document ${documentId}`);
  }
}
export class DocumentTabLimitError extends DocumentError {
  constructor(documentId: string, wouldHave: number, limit: number) {
    super(
      'DOCUMENT_TAB_LIMIT',
      `Document ${documentId} would have ${wouldHave} tabs; expected at most ${limit}`,
    );
  }
}
export class DocumentTabLastError extends DocumentError {
  constructor(documentId: string, tabId: string) {
    super(
      'DOCUMENT_TAB_LAST',
      `Tab ${tabId} is the only tab of document ${documentId}; expected at least one other tab`,
    );
  }
}
export class DocumentTabVersionConflictError extends DocumentError {
  constructor(tabId: string, expected: number, actual: number) {
    super(
      'DOCUMENT_VERSION_CONFLICT',
      `Document tab ${tabId} version ${actual}; expected ${expected}`,
    );
  }
}
