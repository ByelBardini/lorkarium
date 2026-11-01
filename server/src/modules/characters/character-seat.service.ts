import type { ClockPort } from '../auth/clock.port';
import type { UsersDao } from '../auth/users.dao';
import type { MemberRemoval } from '../campaigns/member-removed.port';
import type { MemberRoleChange } from '../campaigns/member-role-changed.port';
import type { MemberSeatNotice, MemberSeatPort } from '../campaigns/member-seat.port';
import type { CharacterPublisherPort } from './character-publisher.port';
import { seatMoveOf, type SeatMove, type SeatShift } from './character-seat.bo';
import type { CharacterRow, CharactersDao } from './characters.dao';
import { toCharacterView, toSeatedCharacterRow } from './characters.mapper';
import {
  charactersEventBase,
  lockCharacters,
  savedVersionOf,
  type CharactersLockDaos,
  type CharactersTransaction,
  type LockedCharacters,
} from './locked-characters';

export type CharacterSeatDaos = CharactersLockDaos &
  Readonly<{
    characters: Pick<
      CharactersDao,
      | 'lockVersion'
      | 'bumpVersion'
      | 'findOfUser'
      | 'findInCampaign'
      | 'insert'
      | 'setUser'
      | 'replaceControllers'
    >;
    /** The nickname a new character is born with. */
    users: Pick<UsersDao, 'findById'>;
  }>;

export type CharacterSeatTransactionRunner = CharactersTransaction<CharacterSeatDaos>;

export type CharacterSeatServiceDeps = Readonly<{
  /** Its own transaction, for a member taken out of a table (the role's has its own). */
  transaction: CharacterSeatTransactionRunner;
  publisher: CharacterPublisherPort;
  clock: ClockPort;
}>;

type Seat = Readonly<{ campaignId: string; userId: string }>;

/** The character follows its player's seat at the table (`seatMoveOf`): created on becoming a
 *  player, hidden while a spectator, nobody's once they leave — always stored, never deleted.
 *  Each move locks the table's characters, bumps their version and is told after the commit.
 *
 *  Example: `await new CharacterSeatService(deps).memberRemoved({ campaignId, userId: biaId })` */
export class CharacterSeatService {
  constructor(private readonly deps: CharacterSeatServiceDeps) {}

  /** The seat of a member inside the transaction of their new role.
   *
   *  Example: `const notice = await seats.seatIn(daos).roleSaved(change)` */
  seatIn(daos: CharacterSeatDaos): MemberSeatPort {
    return {
      roleSaved: (change: MemberRoleChange) =>
        this.moveIn(daos, change, (stored) => ({ from: change.from, to: change.role, stored })),
    };
  }

  /** A member out of a table: their character stays, nobody's, seen by the masters only. */
  async memberRemoved(removal: MemberRemoval): Promise<void> {
    const shiftOf = (stored: boolean): SeatShift => ({ from: null, to: null, stored });
    const notice = await this.deps.transaction((daos) => this.moveIn(daos, removal, shiftOf));
    notice();
  }

  private async moveIn(
    daos: CharacterSeatDaos,
    seat: Seat,
    shiftOf: (stored: boolean) => SeatShift,
  ): Promise<MemberSeatNotice> {
    const locked = await lockCharacters(daos, seat.campaignId);
    const stored = await daos.characters.findOfUser(seat.campaignId, seat.userId);
    const move = seatMoveOf(shiftOf(stored !== undefined));
    const moved = await this.applied(locked, seat, move, stored);
    const version = await savedVersionOf(locked, moved !== null);
    if (moved === null) return () => undefined;
    const base = charactersEventBase(seat.campaignId, version, this.deps.clock);
    const change = { ...base, characters: [toCharacterView(moved)] };
    return () => this.deps.publisher.charactersChanged(change);
  }

  // The character after the move, `null` when the move writes nothing (and tells nothing).
  private async applied(
    { daos }: LockedCharacters<CharacterSeatDaos>,
    seat: Seat,
    move: SeatMove,
    stored: CharacterRow | undefined,
  ): Promise<CharacterRow | null> {
    if (move === 'keep') return null;
    if (move === 'create') return this.created(daos, seat);
    if (!stored) throw new Error(`move ${move} of ${seat.userId} needs a stored character`);
    // Reveal and hide write nothing on the character: its holder role, read in this
    // transaction, already is the new one, and the event says who sees it now.
    if (move === 'leave') return this.left(daos, seat, stored);
    return stored;
  }

  private async created(daos: CharacterSeatDaos, seat: Seat): Promise<CharacterRow> {
    const user = await daos.users.findById(seat.userId);
    if (!user)
      throw new Error(
        `user ${seat.userId} has no account; expected a member of ${seat.campaignId}`,
      );
    return daos.characters.insert(toSeatedCharacterRow(seat.campaignId, seat.userId, user.name));
  }

  private async left(
    daos: CharacterSeatDaos,
    seat: Seat,
    stored: CharacterRow,
  ): Promise<CharacterRow> {
    const { id } = stored.character;
    await daos.characters.setUser(id, null);
    const others = stored.controllerIds.filter((userId) => userId !== seat.userId);
    await daos.characters.replaceControllers(id, others);
    const row = await daos.characters.findInCampaign(seat.campaignId, id);
    if (!row)
      throw new Error(`character ${id} vanished while ${seat.userId} left ${seat.campaignId}`);
    return row;
  }
}
