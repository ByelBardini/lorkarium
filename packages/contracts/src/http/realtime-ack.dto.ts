import { z } from 'zod';
import { apiErrorDto } from './api-error.dto';

/** State version carried by every live snapshot and event (spec §5.5).
 *
 *  Example: `stateVersionDto.parse(event.version)` */
export const stateVersionDto = z.number().int().nonnegative();

/** Failed Socket.IO ack: the same error body as the HTTP API.
 *
 *  Example: `z.discriminatedUnion('ok', [okAck, realtimeAckFailureDto])` */
export const realtimeAckFailureDto = z.strictObject({ ok: z.literal(false), error: apiErrorDto });

export type RealtimeAckFailureDto = z.infer<typeof realtimeAckFailureDto>;
