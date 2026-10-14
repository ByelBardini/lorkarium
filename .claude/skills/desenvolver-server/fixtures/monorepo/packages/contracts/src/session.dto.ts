// Propositalmente errado: objeto frouxo, refine sem spec e função de regra.
import { z } from 'zod';

export const joinSessionDto = z
  .object({ sessionId: z.string(), inviteCode: z.string() })
  .refine((join) => join.inviteCode.length === 6, 'invite code has 6 characters');
export type JoinSessionDto = z.infer<typeof joinSessionDto>;

export function canJoinLate(round: number): boolean {
  return round < 3;
}
