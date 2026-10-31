export type DocumentErrorCode =
  | 'DOCUMENT_NOT_FOUND'
  | 'DOCUMENT_VERSION_CONFLICT'
  | 'DOCUMENT_ACTION_REUSED'
  | 'DOCUMENT_ASSET_NOT_FOUND';
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
