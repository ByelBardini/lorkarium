import { z } from 'zod';

/** Path params of `PATCH /api/campaigns/:campaignId/members/:userId`. */
export const campaignMemberParamsDto = z.strictObject({ campaignId: z.uuid(), userId: z.uuid() });

export type CampaignMemberParamsDto = z.infer<typeof campaignMemberParamsDto>;

/** Body of `PATCH /api/campaigns/:campaignId/members/:userId` (master only): any master swaps
 *  players and spectators; only owner powers (the owner, a juggernaut) promote to master and
 *  demote a master (game-core `assignableRolesOf`).
 *
 *  Example: `updateMemberRoleRequestDto.parse({ role: 'master' })` */
export const updateMemberRoleRequestDto = z.strictObject({
  role: z.enum(['master', 'player', 'spectator']),
});

export type UpdateMemberRoleRequestDto = z.infer<typeof updateMemberRoleRequestDto>;
