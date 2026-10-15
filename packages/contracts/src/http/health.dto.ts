import { z } from 'zod';

/** Body of `GET /api/health` when the server and its database answer.
 *
 *  Example: `healthResponseDto.parse(body).status // 'ok'` */
export const healthResponseDto = z.strictObject({
  status: z.literal('ok'),
});

export type HealthResponseDto = z.infer<typeof healthResponseDto>;
