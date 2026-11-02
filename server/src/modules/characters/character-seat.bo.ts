import type { CampaignRole } from '../campaigns/campaign-access.bo';

/** What a member's new seat does to their character: `create` one (a player without any),
 *  `reveal` the stored one (back from the spectators), `hide` it (demoted to spectator: kept,
 *  seen by the masters only), `leave` it nobody's (out of the table) or `keep` it as it is. */
export type SeatMove = 'create' | 'reveal' | 'hide' | 'leave' | 'keep';

/** A member's seat: the role they had, the one they have now (`null` = out of the table), and
 *  whether a character of theirs is stored at the table. */
export type SeatShift = Readonly<{
  from: CampaignRole | null;
  to: CampaignRole | null;
  stored: boolean;
}>;

/** The character follows its player's role (one per player, spec §6): it is born when they become
 *  a player, stays stored while they watch or after they leave, and a promotion of the same
 *  person brings back theirs. Masters get none of their own.
 *
 *  Example: `seatMoveOf({ from: 'spectator', to: 'player', stored: false }) // 'create'` */
export function seatMoveOf({ from, to, stored }: SeatShift): SeatMove {
  if (!stored) return to === 'player' ? 'create' : 'keep';
  if (to === null) return 'leave';
  if (to === 'spectator') return from === 'spectator' ? 'keep' : 'hide';
  return from === 'spectator' ? 'reveal' : 'keep';
}
