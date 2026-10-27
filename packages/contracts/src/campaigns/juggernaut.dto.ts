import { z } from 'zod';
import { campaignRoleDto } from './campaign.dto';

/** Response of `DELETE /api/campaigns/:campaignId/juggernaut` (admin only): the role the admin
 *  went back to, or `null` when they were not a member and left the campaign. Turning the mode on
 *  (`POST`) answers with the `campaignResponseDto`.
 *
 *  Example: `endJuggernautResponseDto.parse(body).myRole // 'player'` */
export const endJuggernautResponseDto = z.strictObject({
  myRole: campaignRoleDto.nullable(),
});

export type EndJuggernautResponseDto = z.infer<typeof endJuggernautResponseDto>;
