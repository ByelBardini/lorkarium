import { z } from 'zod';
import { sessionLeaveAckDto } from '../sessions/session.dto';
import { boardCommandShape } from './board-event.dto';
import { SCENE_CELLS_MAX } from './scene.dto';

/** One axis of a ping, in fractional cells from 0 to `SCENE_CELLS_MAX`. Any number (NaN and
 *  Infinity too) reaches the refine, so the refusal cites the axis and the value it got. */
function pingCoordinateDto(axis: 'x' | 'y') {
  const anyNumber = z.custom<number>((value) => typeof value === 'number', {
    message: `ping ${axis} is not a number; expected 0 to ${SCENE_CELLS_MAX} cells`,
  });
  return anyNumber.superRefine((value, context) => {
    if (Number.isFinite(value) && value >= 0 && value <= SCENE_CELLS_MAX) return;
    context.addIssue({
      code: 'custom',
      message: `ping ${axis} ${value} is invalid; expected a finite number from 0 to ${SCENE_CELLS_MAX} cells`,
    });
  });
}

/** `board:ping`: points at a spot of one grid for everyone watching it. Ephemeral — nothing is
 *  saved and no version moves. Who pings comes from the connection, never from here (§7.3), and
 *  the grid is required: the server checks the connection is in that grid's room.
 *
 *  Example: `pingCommandDto.parse({ actionId, campaignId, sceneId, x: 3.42, y: 1.5 })` */
export const pingCommandDto = z.strictObject({
  ...boardCommandShape,
  sceneId: z.uuid(),
  x: pingCoordinateDto('x'),
  y: pingCoordinateDto('y'),
});
export type PingCommandDto = z.infer<typeof pingCommandDto>;

/** Answer to `board:ping`: a bare `ok` (nothing was written, so no version) or the API error. */
export const pingAckDto = sessionLeaveAckDto;
export type PingAckDto = z.infer<typeof pingAckDto>;

/** `board:pinged`: to the grid's room, except the connection that pinged. No `version`: like the
 *  drag preview, it is not a confirmed change of the table.
 *
 *  Example: `boardPingedDto.safeParse(payload).success` */
export const boardPingedDto = z.strictObject({
  campaignId: z.uuid(),
  sceneId: z.uuid(),
  userId: z.uuid(),
  x: pingCoordinateDto('x'),
  y: pingCoordinateDto('y'),
  at: z.iso.datetime(),
});
export type BoardPingedDto = z.infer<typeof boardPingedDto>;
