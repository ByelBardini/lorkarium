import { z } from 'zod';

/** Path params of `PATCH /api/campaigns/:campaignId/members/:userId`. */
export const campaignMemberParamsDto = z.strictObject({ campaignId: z.uuid(), userId: z.uuid() });

export type CampaignMemberParamsDto = z.infer<typeof campaignMemberParamsDto>;

/** Body of `PATCH /api/campaigns/:campaignId/members/:userId` (master only): the master promotes a
 *  spectator to player or moves a player to the spectators; nobody becomes master here.
 *
 *  Example: `updateMemberRoleRequestDto.parse({ role: 'player' })` */
export const updateMemberRoleRequestDto = z.strictObject({
  role: z.enum(['player', 'spectator']),
});

export type UpdateMemberRoleRequestDto = z.infer<typeof updateMemberRoleRequestDto>;
