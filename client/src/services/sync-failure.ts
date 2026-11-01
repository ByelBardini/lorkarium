import type { ApiErrorDto } from '@lorkarium/contracts';
import type { BoardSyncFailure } from './table-session-api';

/** An ack that came (the DTO's), never came in time (`offline`) or came outside the DTO. */
export type AckOutcome<Ack> = Ack | 'offline' | 'unexpected';

const SYNC_FAILURE_BY_CODE: Readonly<Record<string, BoardSyncFailure>> = {
  CAMPAIGN_NOT_FOUND: 'not_found',
  SCENE_NOT_FOUND: 'not_found',
  UNAUTHENTICATED: 'unauthenticated',
};

/** The failure a refused snapshot (`board:sync`, `scene:watch`, `character:sync`) stands for.
 *
 *  Example: `syncFailureOf({ code: 'SCENE_NOT_FOUND', message: '…' }) // 'not_found'` */
export function syncFailureOf(error: ApiErrorDto): BoardSyncFailure {
  return SYNC_FAILURE_BY_CODE[error.code] ?? 'unexpected';
}
