import { z } from 'zod';

/** Body of every 4xx/5xx answered by the API.
 *
 *  Example: `apiErrorDto.parse(body).code // 'INVALID_CREDENTIALS'` */
export const apiErrorDto = z.strictObject({
  code: z.string(),
  message: z.string(),
  retryAfterSeconds: z.number().int().nonnegative().optional(),
});

export type ApiErrorDto = z.infer<typeof apiErrorDto>;
