import { z } from 'zod';

export const tokenDto = z.strictObject({ id: z.string(), name: z.string().min(1) });
