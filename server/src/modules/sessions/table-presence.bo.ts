/** Who is at one table: each user's open sockets, who dropped and may still come back, which
 *  sockets stand still (`away`, socket ids are unique) and since when each user is away (every
 *  socket of theirs standing still). */
export type PresenceRoster = Readonly<{
  version: number;
  sockets: ReadonlyMap<string, ReadonlySet<string>>;
  inGrace: ReadonlySet<string>;
  away: ReadonlySet<string>;
  awaySince: ReadonlyMap<string, Date>;
}>;

export const EMPTY_ROSTER: PresenceRoster = {
  version: 0,
  sockets: new Map(),
  inGrace: new Set(),
  away: new Set(),
  awaySince: new Map(),
};

export type PresenceChange =
  | 'came-online'
  | 'already-online'
  | 'returned-in-grace'
  | 'still-online'
  | 'went-offline'
  | 'grace-started'
  | 'already-back'
  | 'went-away'
  | 'came-back'
  | 'still-active'
  | 'already-away'
  | 'profile-changed'
  | 'not-connected';

export type DisconnectReason = 'left' | 'dropped';

export type PresenceOutcome = Readonly<{ roster: PresenceRoster; change: PresenceChange }>;

/** Presence counted per user, not per socket: a second tab or a short drop is not a leave, and a
 *  user is away only when every tab of theirs stands still. Only what others see bumps the
 *  version: `came-online`, `went-offline`, `went-away`, `came-back` and `profile-changed`. The
 *  time comes in by parameter (no clock in the rule).
 *
 *  Example: `new TablePresenceBo(EMPTY_ROSTER).connect(userId, socket.id).change // 'came-online'` */
export class TablePresenceBo {
  constructor(private readonly roster: PresenceRoster) {}

  connect(userId: string, socketId: string): PresenceOutcome {
    const held = this.roster.sockets.get(userId);
    const sockets = withSockets(this.roster.sockets, userId, [...(held ?? []), socketId]);
    const inGrace = without(this.roster.inGrace, userId);
    if (this.roster.awaySince.has(userId)) {
      return this.cameBack({ ...this.roster, sockets, inGrace }, userId);
    }
    if (this.roster.inGrace.has(userId)) {
      return { roster: { ...this.roster, sockets, inGrace }, change: 'returned-in-grace' };
    }
    if (held) return { roster: { ...this.roster, sockets }, change: 'already-online' };
    return {
      roster: { ...this.roster, sockets, version: this.nextVersion() },
      change: 'came-online',
    };
  }

  disconnect(
    userId: string,
    socketId: string,
    reason: DisconnectReason,
    at: Date,
  ): PresenceOutcome {
    const held = this.roster.sockets.get(userId);
    if (!held?.has(socketId)) return this.unchanged('not-connected');
    const remaining = [...held].filter((id) => id !== socketId);
    const sockets = withSockets(this.roster.sockets, userId, remaining);
    const rest = { ...this.roster, sockets, away: without(this.roster.away, socketId) };
    if (remaining.length > 0) return this.stillOnline(rest, userId, at);
    if (reason === 'left') return this.offline(rest, userId);
    const inGrace = new Set([...this.roster.inGrace, userId]);
    return { roster: { ...rest, inGrace }, change: 'grace-started' };
  }

  expireGrace(userId: string): PresenceOutcome {
    if (this.roster.inGrace.has(userId)) {
      return this.offline(
        { ...this.roster, inGrace: without(this.roster.inGrace, userId) },
        userId,
      );
    }
    return this.unchanged(this.roster.sockets.has(userId) ? 'already-back' : 'not-connected');
  }

  /** One tab of the user stood still: away once every tab of theirs does, since `at`. */
  markAway(userId: string, socketId: string, at: Date): PresenceOutcome {
    if (!this.holds(userId, socketId)) return this.unchanged('not-connected');
    if (this.roster.awaySince.has(userId)) return this.unchanged('already-away');
    const away = new Set([...this.roster.away, socketId]);
    const roster = { ...this.roster, away };
    if (!allStill(roster, userId)) return { roster, change: 'still-active' };
    return this.wentAway(roster, userId, at);
  }

  /** One tab of the user moved again: back, if they were away. */
  markActive(userId: string, socketId: string): PresenceOutcome {
    if (!this.holds(userId, socketId)) return this.unchanged('not-connected');
    const roster = { ...this.roster, away: without(this.roster.away, socketId) };
    if (this.roster.awaySince.has(userId)) return this.cameBack(roster, userId);
    return { roster, change: 'still-active' };
  }

  /** A member of the table saved nickname, color, bio or photo: no socket moves, but everyone
   *  sees the new profile, so the version does.
   *
   *  Example: `new TablePresenceBo(roster).profileChanged().roster.version // roster.version + 1` */
  profileChanged(): PresenceOutcome {
    return { roster: { ...this.roster, version: this.nextVersion() }, change: 'profile-changed' };
  }

  isOnline(userId: string): boolean {
    return this.roster.sockets.has(userId) || this.roster.inGrace.has(userId);
  }

  awaySinceOf(userId: string): Date | null {
    return this.roster.awaySince.get(userId) ?? null;
  }

  private holds(userId: string, socketId: string): boolean {
    return this.roster.sockets.get(userId)?.has(socketId) ?? false;
  }

  // The tab left open may be one that stood still: closing the active one makes the user away.
  private stillOnline(roster: PresenceRoster, userId: string, at: Date): PresenceOutcome {
    if (roster.awaySince.has(userId) || !allStill(roster, userId)) {
      return { roster, change: 'still-online' };
    }
    return this.wentAway(roster, userId, at);
  }

  private wentAway(roster: PresenceRoster, userId: string, at: Date): PresenceOutcome {
    const awaySince = new Map([...roster.awaySince, [userId, at]]);
    return { roster: { ...roster, awaySince, version: this.nextVersion() }, change: 'went-away' };
  }

  private cameBack(roster: PresenceRoster, userId: string): PresenceOutcome {
    const awaySince = withoutKey(roster.awaySince, userId);
    return { roster: { ...roster, awaySince, version: this.nextVersion() }, change: 'came-back' };
  }

  private offline(roster: PresenceRoster, userId: string): PresenceOutcome {
    const awaySince = withoutKey(roster.awaySince, userId);
    return {
      roster: { ...roster, awaySince, version: this.nextVersion() },
      change: 'went-offline',
    };
  }

  private unchanged(change: PresenceChange): PresenceOutcome {
    return { roster: this.roster, change };
  }

  private nextVersion(): number {
    return this.roster.version + 1;
  }
}

function allStill(roster: PresenceRoster, userId: string): boolean {
  const held = [...(roster.sockets.get(userId) ?? [])];
  return held.length > 0 && held.every((socketId) => roster.away.has(socketId));
}

function withSockets(
  sockets: ReadonlyMap<string, ReadonlySet<string>>,
  userId: string,
  socketIds: readonly string[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const next = new Map(sockets);
  if (socketIds.length === 0) next.delete(userId);
  else next.set(userId, new Set(socketIds));
  return next;
}

function without(items: ReadonlySet<string>, item: string): ReadonlySet<string> {
  const next = new Set(items);
  next.delete(item);
  return next;
}

function withoutKey<T>(entries: ReadonlyMap<string, T>, key: string): ReadonlyMap<string, T> {
  const next = new Map(entries);
  next.delete(key);
  return next;
}
