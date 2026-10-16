import type { ApiErrorDto, RealtimeAckFailureDto } from '@lorkarium/contracts';

/** An ack callback the client may or may not have sent. */
export type AckOf<T> = ((answer: T | RealtimeAckFailureDto) => void) | undefined;

/** Runs `work` and answers the ack with its result, or with the error `failureOf` translates.
 *  `onFailure` runs after the answer (to drop a connection whose session ended, for instance).
 *
 *  Example: `void answerAck(ack, () => syncBoard(socket, payload), toAckError)` */
export async function answerAck<T>(
  ack: AckOf<T>,
  work: () => Promise<T>,
  failureOf: (error: unknown) => ApiErrorDto,
  onFailure: (error: unknown) => void = () => undefined,
): Promise<void> {
  try {
    replyToAck(ack, await work());
  } catch (error) {
    replyToAck(ack, { ok: false, error: failureOf(error) });
    onFailure(error);
  }
}

// A client may emit without an ack callback; there is nothing to answer then.
function replyToAck<T>(ack: AckOf<T>, body: T | RealtimeAckFailureDto): void {
  if (typeof ack === 'function') ack(body);
}
