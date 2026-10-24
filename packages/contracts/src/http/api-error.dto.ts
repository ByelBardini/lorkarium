import { z } from 'zod';
import { blockingCampaignDto } from '../admin/admin-users.dto';

/** Body of every 4xx/5xx answered by the API.
 *
 *  Example: `apiErrorDto.parse(body).code // 'INVALID_CREDENTIALS'` */
export const apiErrorDto = z.strictObject({
  code: z.string(),
  message: z.string(),
  retryAfterSeconds: z.number().int().nonnegative().optional(),
  /** `ALREADY_INVITED`: the pending invitation of that address, to resend it. */
  invitationId: z.uuid().optional(),
  /** `OWNS_SHARED_CAMPAIGNS`: the tables that keep the account from being deleted. */
  blockingCampaigns: z.array(blockingCampaignDto).optional(),
});

export type ApiErrorDto = z.infer<typeof apiErrorDto>;
