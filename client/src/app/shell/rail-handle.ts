import type { UIMatch } from 'react-router';

/** What a route tells the shell about the rail through its `handle`. */
export type RailHandle = Readonly<{ rail: 'compact' }>;

/** The play room wants the whole width: rail collapsed, without touching the stored preference.
 *
 *  Example: `{ path: 'campaigns/:campaignId/table', handle: COMPACT_RAIL_HANDLE }` */
export const COMPACT_RAIL_HANDLE: RailHandle = { rail: 'compact' };

/** Whether any matched route asked for the compact rail.
 *
 *  Example: `const compact = wantsCompactRail(useMatches())` */
export function wantsCompactRail(matches: readonly UIMatch[]): boolean {
  return matches.some((match) => isRailHandle(match.handle));
}

function isRailHandle(handle: unknown): handle is RailHandle {
  return (
    typeof handle === 'object' && handle !== null && 'rail' in handle && handle.rail === 'compact'
  );
}
