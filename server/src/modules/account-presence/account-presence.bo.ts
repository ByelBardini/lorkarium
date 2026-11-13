/** What the account chooses; `away` is automatic, never chosen. */
export type AccountVisibility = 'online' | 'invisible';

/** What friends see: an invisible account counts as `offline`. */
export type SeenStatus = 'online' | 'away' | 'offline';

/** A table one socket of the account has open; only a public one is shown to friends. */
export type OpenedTable = Readonly<{ campaignId: string; name: string; isPublic: boolean }>;

type SocketTable = Readonly<{ socketId: string; table: OpenedTable }>;

/** One account's presence: its open sockets, which stand still, whether it dropped and may still
 *  come back, what it chose to show and the tables open in its sockets, oldest first. */
export type AccountPresence = Readonly<{
  sockets: ReadonlySet<string>;
  still: ReadonlySet<string>;
  inGrace: boolean;
  visibility: AccountVisibility;
  tables: readonly SocketTable[];
}>;

export const EMPTY_ACCOUNT_PRESENCE: AccountPresence = {
  sockets: new Set(),
  still: new Set(),
  inGrace: false,
  visibility: 'online',
  tables: [],
};

export type AccountPresenceChange =
  | 'came-online'
  | 'already-online'
  | 'returned-in-grace'
  | 'still-online'
  | 'grace-started'
  | 'went-offline'
  | 'already-back'
  | 'went-away'
  | 'came-back'
  | 'still-active'
  | 'already-away'
  | 'visibility-changed'
  | 'visibility-unchanged'
  | 'table-opened'
  | 'table-closed'
  | 'table-unchanged'
  | 'not-connected';

export type AccountDisconnectReason = 'left' | 'dropped';

export type AccountPresenceOutcome = Readonly<{
  state: AccountPresence;
  change: AccountPresenceChange;
}>;

/** What friends see of the account; the mapper adds the `userId` for the DTO. */
export type SeenPresence = Readonly<{
  status: SeenStatus;
  table: Readonly<{ campaignId: string; name: string }> | null;
}>;

/** Presence of one account across every tab, with or without a table open: a second tab or a
 *  short drop changes nothing, away only when every tab stands still, invisible is seen as
 *  offline. Never mutates; whether friends must hear about it is `seenPresenceChanged`.
 *
 *  Example: `new AccountPresenceBo(EMPTY_ACCOUNT_PRESENCE).connect(socket.id).change // 'came-online'` */
export class AccountPresenceBo {
  constructor(private readonly presence: AccountPresence) {}

  connect(socketId: string): AccountPresenceOutcome {
    const { sockets, inGrace } = this.presence;
    const state = { ...this.presence, sockets: new Set([...sockets, socketId]), inGrace: false };
    if (isAway(this.presence)) return { state, change: 'came-back' };
    if (inGrace) return { state, change: 'returned-in-grace' };
    if (sockets.size > 0) return { state, change: 'already-online' };
    return { state, change: 'came-online' };
  }

  disconnect(socketId: string, reason: AccountDisconnectReason): AccountPresenceOutcome {
    if (!this.presence.sockets.has(socketId)) return this.unchanged('not-connected');
    const state = withoutSocket(this.presence, socketId);
    if (state.sockets.size > 0) {
      return {
        state,
        change: isAway(state) && !isAway(this.presence) ? 'went-away' : 'still-online',
      };
    }
    if (reason === 'left') return { state, change: 'went-offline' };
    return { state: { ...state, inGrace: true }, change: 'grace-started' };
  }

  expireGrace(): AccountPresenceOutcome {
    if (this.presence.inGrace) {
      return { state: { ...this.presence, inGrace: false }, change: 'went-offline' };
    }
    return this.unchanged(this.presence.sockets.size > 0 ? 'already-back' : 'not-connected');
  }

  /** One tab stood still: the account is away once every tab of it does. */
  markAway(socketId: string): AccountPresenceOutcome {
    if (!this.presence.sockets.has(socketId)) return this.unchanged('not-connected');
    if (isAway(this.presence)) return this.unchanged('already-away');
    const state = { ...this.presence, still: new Set([...this.presence.still, socketId]) };
    return { state, change: isAway(state) ? 'went-away' : 'still-active' };
  }

  markActive(socketId: string): AccountPresenceOutcome {
    if (!this.presence.sockets.has(socketId)) return this.unchanged('not-connected');
    const state = { ...this.presence, still: without(this.presence.still, socketId) };
    return { state, change: isAway(this.presence) ? 'came-back' : 'still-active' };
  }

  /** Online or Invisible, for every tab of the account at once. */
  setVisibility(visibility: AccountVisibility): AccountPresenceOutcome {
    if (this.presence.visibility === visibility) return this.unchanged('visibility-unchanged');
    return { state: { ...this.presence, visibility }, change: 'visibility-changed' };
  }

  /** A socket of the account entered a table; the last public one opened is the one shown.
   *
   *  Example: `bo.openTable(socket.id, { campaignId, name: 'Vharn', isPublic: true })` */
  openTable(socketId: string, table: OpenedTable): AccountPresenceOutcome {
    if (!this.presence.sockets.has(socketId)) return this.unchanged('not-connected');
    if (this.holdsTable(socketId, table.campaignId)) return this.unchanged('table-unchanged');
    const tables = [...this.presence.tables, { socketId, table }];
    return { state: { ...this.presence, tables }, change: 'table-opened' };
  }

  closeTable(socketId: string, campaignId: string): AccountPresenceOutcome {
    if (!this.holdsTable(socketId, campaignId)) return this.unchanged('table-unchanged');
    const tables = this.presence.tables.filter(
      (entry) => entry.socketId !== socketId || entry.table.campaignId !== campaignId,
    );
    return { state: { ...this.presence, tables }, change: 'table-closed' };
  }

  /** What friends see: `offline` for an invisible account, and only a public table.
   *
   *  Example: `new AccountPresenceBo(state).seen() // { status: 'away', table: null }` */
  seen(): SeenPresence {
    const status = seenStatus(this.presence);
    if (status === 'offline') return { status, table: null };
    const shown = this.presence.tables.findLast((entry) => entry.table.isPublic);
    if (!shown) return { status, table: null };
    return { status, table: { campaignId: shown.table.campaignId, name: shown.table.name } };
  }

  /** Online or away as friends see it: whom a private message may reach. */
  isVisiblyOnline(): boolean {
    return seenStatus(this.presence) !== 'offline';
  }

  /** No socket and no grace: nothing left to keep in memory. */
  isEmpty(): boolean {
    return this.presence.sockets.size === 0 && !this.presence.inGrace;
  }

  private holdsTable(socketId: string, campaignId: string): boolean {
    return this.presence.tables.some(
      (entry) => entry.socketId === socketId && entry.table.campaignId === campaignId,
    );
  }

  private unchanged(change: AccountPresenceChange): AccountPresenceOutcome {
    return { state: this.presence, change };
  }
}

/** Whether friends must hear about the move from `before` to `after` (status or shown table).
 *
 *  Example: `if (seenPresenceChanged(before, outcome.state)) publisher.friendChanged(...)` */
export function seenPresenceChanged(before: AccountPresence, after: AccountPresence): boolean {
  const was = new AccountPresenceBo(before).seen();
  const now = new AccountPresenceBo(after).seen();
  return was.status !== now.status || was.table?.campaignId !== now.table?.campaignId;
}

function seenStatus(presence: AccountPresence): SeenStatus {
  if (presence.visibility === 'invisible') return 'offline';
  if (presence.sockets.size === 0 && !presence.inGrace) return 'offline';
  return isAway(presence) ? 'away' : 'online';
}

function isAway(presence: AccountPresence): boolean {
  const held = [...presence.sockets];
  return held.length > 0 && held.every((socketId) => presence.still.has(socketId));
}

function withoutSocket(presence: AccountPresence, socketId: string): AccountPresence {
  return {
    ...presence,
    sockets: without(presence.sockets, socketId),
    still: without(presence.still, socketId),
    tables: presence.tables.filter((entry) => entry.socketId !== socketId),
  };
}

function without(items: ReadonlySet<string>, item: string): ReadonlySet<string> {
  const next = new Set(items);
  next.delete(item);
  return next;
}
