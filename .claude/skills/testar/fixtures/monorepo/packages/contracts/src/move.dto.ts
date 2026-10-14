import { z } from 'zod';

export const moveTokenDto = z
  .strictObject({ tokenId: z.string(), column: z.number(), row: z.number() })
  .refine((move) => move.column >= 0 && move.row >= 0, 'column and row must be non-negative');
