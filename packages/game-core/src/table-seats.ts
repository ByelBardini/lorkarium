/** Role inside one campaign; unrelated to the global account role. */
export type TableRole = 'master' | 'player' | 'spectator';

/** Where someone sits at the table: the role, whether they created the campaign, and whether
 *  they are an admin in juggernaut mode (always `master` while it is on). */
export type TableSeat = Readonly<{ role: TableRole; owner: boolean; juggernaut: boolean }>;

const TABLE_ROLES: readonly TableRole[] = ['master', 'player', 'spectator'];

/** Whether the seat manages the masters and deletes the campaign: the owner and a juggernaut.
 *
 *  Example: `hasOwnerPowers({ role: 'master', owner: false, juggernaut: true }) // true` */
export function hasOwnerPowers(seat: TableSeat): boolean {
  return seat.owner || seat.juggernaut;
}

/** Whether nobody may change the seat's role. Whoever holds owner powers is locked, so two
 *  juggernauts (or a juggernaut and the owner) never demote each other.
 *
 *  Example: `isRoleLocked({ role: 'master', owner: true, juggernaut: false }) // true` */
export function isRoleLocked(seat: TableSeat): boolean {
  return hasOwnerPowers(seat);
}

/** The roles `actor` may put `target` in, in a fixed order: owner powers move anyone unlocked to
 *  any other role; a plain master only swaps players and spectators. The server refuses with it
 *  and the client builds the role menus with it.
 *
 *  Example: `assignableRolesOf(owner, player) // ['master', 'spectator']` */
export function assignableRolesOf(actor: TableSeat, target: TableSeat): readonly TableRole[] {
  if (actor.role !== 'master' || isRoleLocked(target)) return [];
  if (hasOwnerPowers(actor)) return TABLE_ROLES.filter((role) => role !== target.role);
  if (target.role === 'master') return [];
  return [target.role === 'player' ? 'spectator' : 'player'];
}
