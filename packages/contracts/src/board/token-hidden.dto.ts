import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import { veiledLightDto } from './light.dto';
import { tokenIdGroupDto } from './token-id-group.dto';

/** `token:setHiddenMany` (master): hide the tokens from the players, or show them again. The
 *  masters and each token's controllers keep receiving it.
 *
 *  Example: `setTokensHiddenCommandDto.parse({ actionId, campaignId, tokenIds: [wolfId], hidden: true })` */
export const setTokensHiddenCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenIds: tokenIdGroupDto,
  hidden: z.boolean(),
});
export type SetTokensHiddenCommandDto = z.infer<typeof setTokensHiddenCommandDto>;

/** `token:hiddenChanged`: to who still sees the tokens. The rest gets `token:deletedMany` when they
 *  hide and `token:createdMany` when they show. */
export const tokensHiddenChangedDto = z.strictObject({
  ...boardEventShape,
  tokenIds: z.array(z.uuid()),
  hidden: z.boolean(),
});
export type TokensHiddenChangedDto = z.infer<typeof tokensHiddenChangedDto>;

/** `token:veiledLightsChanged`: the whole list of lights of the hidden tokens this viewer does not
 *  receive, replacing the one they had. No version, like a drag: the list is all there is. */
export const veiledLightsChangedDto = z.strictObject({
  campaignId: z.uuid(),
  sceneId: z.uuid(),
  at: z.iso.datetime(),
  lights: z.array(veiledLightDto),
});
export type VeiledLightsChangedDto = z.infer<typeof veiledLightsChangedDto>;
