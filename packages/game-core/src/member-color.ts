import { stableHash } from './stable-hash';

/** The 8 colors a person can have on the board, by stable name: gold, steel, ember, moss, violet,
 *  rose, teal and bone. The order is the one the ping palette always had, so the automatic color
 *  of someone who never chose stays the same. The hex lives only in the client. */
export const MEMBER_COLORS = [
  'gold',
  'steel',
  'ember',
  'moss',
  'violet',
  'rose',
  'teal',
  'bone',
] as const;

export type MemberColor = (typeof MEMBER_COLORS)[number];

/** The effective color of a person: the one they chose, or the one drawn from their id.
 *
 *  Example: `memberColorOf(user.id, null) // 'teal'` */
export function memberColorOf(userId: string, choice: MemberColor | null): MemberColor {
  if (choice !== null) return choice;
  return MEMBER_COLORS[stableHash(userId) % MEMBER_COLORS.length] ?? 'gold';
}
