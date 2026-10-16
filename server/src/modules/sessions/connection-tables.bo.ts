import { TooManyTablesError } from './sessions.error';

export type ConnectionTablesChange = 'admitted' | 'already-open' | 'released' | 'not-open';

export type ConnectionTablesOutcome = Readonly<{
  tables: ReadonlySet<string>;
  change: ConnectionTablesChange;
}>;

/** The tables one connection is in, capped at `limit` so a single connection cannot grow the
 *  presence registry without end. Never mutates the set it was built from.
 *
 *  Example: `new ConnectionTablesBo(socket.data.campaignIds, 5).admit(campaignId).tables` */
export class ConnectionTablesBo {
  constructor(
    private readonly open: ReadonlySet<string>,
    private readonly limit: number,
  ) {}

  admit(campaignId: string): ConnectionTablesOutcome {
    if (this.open.has(campaignId)) return { tables: this.open, change: 'already-open' };
    if (this.open.size >= this.limit) throw new TooManyTablesError(campaignId, this.limit);
    return { tables: new Set([...this.open, campaignId]), change: 'admitted' };
  }

  release(campaignId: string): ConnectionTablesOutcome {
    if (!this.open.has(campaignId)) return { tables: this.open, change: 'not-open' };
    const tables = new Set(this.open);
    tables.delete(campaignId);
    return { tables, change: 'released' };
  }
}
