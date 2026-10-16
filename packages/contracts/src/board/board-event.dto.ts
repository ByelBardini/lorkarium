import { z } from 'zod';
import { stateVersionDto } from '../http/realtime-ack.dto';

/** Fields of every board command: who asks comes from the connection, never from here (§7.3).
 *
 *  Example: `z.strictObject({ ...boardCommandShape, tokenId: z.uuid() })` */
export const boardCommandShape = { actionId: z.uuid(), campaignId: z.uuid() };

/** Fields of every board event: the table, the board version it produced and when (§5.5).
 *
 *  Example: `z.strictObject({ ...boardEventShape, tokenId: z.uuid() })` */
export const boardEventShape = {
  campaignId: z.uuid(),
  version: stateVersionDto,
  at: z.iso.datetime(),
};
