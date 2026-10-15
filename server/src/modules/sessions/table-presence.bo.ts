/** Who is at one table: each user's open sockets, and who dropped and may still come back. */
export type PresenceRoster = Readonly<{
  version: number;
  sockets: ReadonlyMap<string, ReadonlySet<string>>;
  inGrace: ReadonlySet<string>;
}>;

export const EMPTY_ROSTER: PresenceRoster = { version: 0, sockets: new Map(), inGrace: new Set() };

export type PresenceChange =
  | 'came-online'
  | 'already-online'
  | 'returned-in-grace'
  | 'still-online'
  | 'went-offline'
  | 'grace-started'
  | 'already-back'
  | 'not-connected';

export type DisconnectReason = 'left' | 'dropped';

export type PresenceOutcome = Readonly<{ roster: PresenceRoster; change: PresenceChange }>;

/** Presence counted per user, not per socket: a second tab or a short drop is not a leave.
 *  Only `came-online` and `went-offline` bump the version, since only they change what others see.
 *
 *  Example: `new TablePresenceBo(EMPTY_ROSTER).connect(userId, socket.id).change // 'came-online'` */
export class TablePresenceBo {
  constructor(private readonly roster: PresenceRoster) {}

  connect(userId: string, socketId: string): PresenceOutcome {
    const held = this.roster.sockets.get(userId);
    const sockets = withSockets(this.roster.sockets, userId, [...(held ?? []), socketId]);
    if (this.roster.inGrace.has(userId)) {
      const inGrace = without(this.roster.inGrace, userId);
      return { roster: { ...this.roster, sockets, inGrace }, change: 'returned-in-grace' };
    }
    if (held) return { roster: { ...this.roster, sockets }, change: 'already-online' };
    return {
      roster: { ...this.roster, sockets, version: this.nextVersion() },
      change: 'came-online',
    };
  }

  disconnect(userId: string, socketId: string, reason: DisconnectReason): PresenceOutcome {
    const held = this.roster.sockets.get(userId);
    if (!held?.has(socketId)) return this.unchanged('not-connected');
    const remaining = [...held].filter((id) => id !== socketId);
    const sockets = withSockets(this.roster.sockets, userId, remaining);
    if (remaining.length > 0)
      return { roster: { ...this.roster, sockets }, change: 'still-online' };
    if (reason === 'left') return this.offline({ ...this.roster, sockets });
    const inGrace = new Set([...this.roster.inGrace, userId]);
    return { roster: { ...this.roster, sockets, inGrace }, change: 'grace-started' };
  }

  expireGrace(userId: string): PresenceOutcome {
    if (this.roster.inGrace.has(userId)) {
      return this.offline({ ...this.roster, inGrace: without(this.roster.inGrace, userId) });
    }
    return this.unchanged(this.roster.sockets.has(userId) ? 'already-back' : 'not-connected');
  }

  isOnline(userId: string): boolean {
    return this.roster.sockets.has(userId) || this.roster.inGrace.has(userId);
  }

  private offline(roster: PresenceRoster): PresenceOutcome {
    return { roster: { ...roster, version: this.nextVersion() }, change: 'went-offline' };
  }

  private unchanged(change: PresenceChange): PresenceOutcome {
    return { roster: this.roster, change };
  }

  private nextVersion(): number {
    return this.roster.version + 1;
  }
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

function without(users: ReadonlySet<string>, userId: string): ReadonlySet<string> {
  const next = new Set(users);
  next.delete(userId);
  return next;
}
