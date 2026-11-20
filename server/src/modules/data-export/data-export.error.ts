import { DATA_EXPORT_TOO_SOON_CODE } from '@lorkarium/contracts';

export type DataExportErrorCode = typeof DATA_EXPORT_TOO_SOON_CODE;

/** Every refusal of the data export; the edge turns `code` into the HTTP status. */
export class DataExportError extends Error {
  constructor(
    readonly code: DataExportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DataExportError';
  }
}

/** A second export before the interval ran out; `nextAt` is when the next one is allowed. */
export class DataExportTooSoonError extends DataExportError {
  readonly retryAfterSeconds: number;

  constructor(
    readonly userId: string,
    readonly lastExportedAt: Date,
    readonly nextAt: Date,
    now: Date,
  ) {
    super(
      DATA_EXPORT_TOO_SOON_CODE,
      `account ${userId} exported its data at ${lastExportedAt.toISOString()}: expected one export per interval, next at ${nextAt.toISOString()}`,
    );
    this.retryAfterSeconds = Math.max(1, Math.ceil((nextAt.getTime() - now.getTime()) / 1000));
  }
}
