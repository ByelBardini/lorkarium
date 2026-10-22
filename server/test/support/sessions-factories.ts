import type { PresenceRoster } from '../../src/modules/sessions/table-presence.bo';

type RosterShape = Readonly<{
  version?: number;
  sockets?: Readonly<Record<string, readonly string[]>>;
  inGrace?: readonly string[];
  away?: readonly string[];
  awaySince?: Readonly<Record<string, Date>>;
}>;

/** A presence roster written as plain records, so a spec reads who holds which sockets, which
 *  of them stand still (`away`) and since when each user is away (`awaySince`).
 *
 *  Example: `presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } })` */
export function presenceRoster(shape: RosterShape = {}): PresenceRoster {
  const entries = Object.entries(shape.sockets ?? {});
  return {
    version: shape.version ?? 0,
    sockets: new Map(entries.map(([userId, ids]) => [userId, new Set(ids)])),
    inGrace: new Set(shape.inGrace ?? []),
    away: new Set(shape.away ?? []),
    awaySince: new Map(Object.entries(shape.awaySince ?? {})),
  };
}
