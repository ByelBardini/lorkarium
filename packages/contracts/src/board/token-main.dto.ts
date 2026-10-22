import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';

/** The token a person's dock shows when nothing is selected, on the active scene. It is not a
 *  secret: the whole table gets every choice.
 *
 *  Example: `mainTokenDto.parse({ userId, tokenId })` */
export const mainTokenDto = z.strictObject({ userId: z.uuid(), tokenId: z.uuid() });
export type MainTokenDto = z.infer<typeof mainTokenDto>;

/** `token:setMain`: who asks comes from the connection, never from here (§7.3). Without
 *  `playerId` one chooses one's own main token, which takes being listed in the control of the
 *  token (the master's power does not count); with it, only the master chooses for that player,
 *  who must be listed.
 *
 *  Example: `setMainTokenCommandDto.parse({ actionId, campaignId, tokenId, playerId: biaId })` */
export const setMainTokenCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
  playerId: z.uuid().optional(),
});
export type SetMainTokenCommandDto = z.infer<typeof setMainTokenCommandDto>;

/** `token:mainChanged`: to the whole table, with a version. */
export const mainTokenChangedDto = z.strictObject({ ...boardEventShape, ...mainTokenDto.shape });
export type MainTokenChangedDto = z.infer<typeof mainTokenChangedDto>;
