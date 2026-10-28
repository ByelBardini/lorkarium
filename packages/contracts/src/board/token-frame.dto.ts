import { z } from 'zod';

/** `square` shows the whole image (contain); `round` crops it to a circle (cover) with the side ring. */
export const tokenFrameDto = z.enum(['square', 'round']);
export type TokenFrameDto = z.infer<typeof tokenFrameDto>;
