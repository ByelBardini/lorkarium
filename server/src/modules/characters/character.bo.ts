import { adjustBarValues, type BarAdjustment, type BarValues } from '@lorkarium/game-core';
import type { CampaignAccessBo, CampaignRole } from '../campaigns/campaign-access.bo';
import { SheetNotFoundError } from '../sheets/sheets.error';
import { CharacterBarNotFoundError, CharacterNotFoundError } from './characters.error';

/** Whose a character is: its player, the role they have at the table now (`null` = nobody's, or
 *  they left) and who controls it. */
export type CharacterSeat = Readonly<{
  characterId: string;
  userId: string | null;
  holderRole: CampaignRole | null;
  controllerIds: readonly string[];
}>;

/** Who sees a character whole: the masters, its player and its controllers (`privileged`), or the
 *  rest of the table (`others`, without the `controllers` bars). */
export type CharacterAudience = 'privileged' | 'others';

export type CharacterBarRef = Readonly<{ id: string; current: number; max: number }>;

/** Whether the whole table sees a character, or only the masters: a character whose player is a
 *  spectator (demoted) or nobody (left) stays stored, hidden and inert.
 *
 *  Example: `isSeenByTable('spectator') // false` */
export function isSeenByTable(holderRole: CampaignRole | null): boolean {
  return holderRole === 'player' || holderRole === 'master';
}

/** The members who get the character whole besides the masters: its player and its controllers.
 *
 *  Example: `privilegedUserIdsOf({ userId: biaId, controllerIds: [biaId, caioId], … }) // [biaId, caioId]` */
export function privilegedUserIdsOf(
  seat: Pick<CharacterSeat, 'userId' | 'controllerIds'>,
): string[] {
  const player = seat.userId === null ? [] : [seat.userId];
  return [...new Set([...player, ...seat.controllerIds])];
}

/** What one member may do with one character (spec §3.9): the masters, its player and its
 *  controllers change it; the rest of the table sees it redacted. A stored character (its player
 *  a spectator, or gone) is seen by the masters only; a spectator changes nothing.
 *
 *  Example: `new CharacterBo(access, seat).requireEdit('change')` */
export class CharacterBo {
  constructor(
    private readonly access: CampaignAccessBo,
    private readonly seat: CharacterSeat,
  ) {}

  isSeen(): boolean {
    return this.access.isMaster() || isSeenByTable(this.seat.holderRole);
  }

  canControl(): boolean {
    if (!this.isSeen()) return false;
    if (this.access.isMaster()) return true;
    if (this.access.isSpectator()) return false;
    return privilegedUserIdsOf(this.seat).some((userId) => this.access.isUser(userId));
  }

  audience(): CharacterAudience {
    return this.canControl() ? 'privileged' : 'others';
  }

  /** A character this member does not see (stored, for anyone but the masters) is
   *  CHARACTER_NOT_FOUND, never FORBIDDEN: its existence does not leak. */
  requireSeen(): void {
    if (this.isSeen()) return;
    throw new CharacterNotFoundError(this.access.campaignIdOf(), this.seat.characterId);
  }

  /** The sheet must be one this character holds (`holderId` = the character that holds it);
   *  another's, or none, is SHEET_NOT_FOUND.
   *
   *  Example: `bo.requireOwnSheet(sheetId, sheet?.characterId ?? null)` */
  requireOwnSheet(sheetId: string, holderId: string | null): void {
    if (holderId === this.seat.characterId) return;
    throw new SheetNotFoundError(
      this.access.campaignIdOf(),
      `sheet ${sheetId} held by character ${this.seat.characterId}`,
    );
  }

  /** Throws FORBIDDEN for a spectator, CHARACTER_NOT_FOUND for a character this member does not
   *  see, FORBIDDEN for anyone but its player, its controllers and the masters. */
  requireEdit(action: string): void {
    this.access.requireMember();
    this.requireSeen();
    if (this.canControl()) return;
    this.access.forbid(
      `${action} character ${this.seat.characterId}`,
      'being its player, one of its controllers or the master role',
    );
  }

  /** The values of one of its bars after `change`, by the game-core rule (`limit` =
   *  `BAR_VALUE_LIMIT`); edit rights first, then the bar must be this character's.
   *
   *  Example: `bo.adjustBar(row.bars, barId, { op: 'add', amount: -7 }, BAR_VALUE_LIMIT)` */
  adjustBar(
    bars: readonly CharacterBarRef[],
    barId: string,
    change: BarAdjustment,
    limit: number,
  ): BarValues {
    this.requireEdit('adjust a bar of');
    const bar = bars.find(({ id }) => id === barId);
    if (!bar) throw new CharacterBarNotFoundError(this.seat.characterId, barId);
    return adjustBarValues(bar, change, limit);
  }
}
