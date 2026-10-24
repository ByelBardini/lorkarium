import { z } from 'zod';
import { stateVersionDto } from '../http/realtime-ack.dto';

/** Fields of every board command: who asks comes from the connection, never from here (§7.3).
 *  `sceneId` is the grid it acts on; absent = the group grid (the table's active scene).
 *
 *  Example: `z.strictObject({ ...boardCommandShape, tokenId: z.uuid() })` */
export const boardCommandShape = {
  actionId: z.uuid(),
  campaignId: z.uuid(),
  sceneId: z.uuid().optional(),
};

/** Fields of every board event: the table, the grid it happened on, the version it produced
 *  and when (§5.5). The client routes each event to the store of its grid by `sceneId`.
 *
 *  Example: `z.strictObject({ ...boardEventShape, tokenId: z.uuid() })` */
export const boardEventShape = {
  campaignId: z.uuid(),
  sceneId: z.uuid(),
  version: stateVersionDto,
  at: z.iso.datetime(),
};
