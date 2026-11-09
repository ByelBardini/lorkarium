import type { TokenPatrolDto, TokenPatrolsChangedDto } from '@lorkarium/contracts';
import { VHARN_GRID } from './table-session-fixtures';

/** When the patrols of these fixtures were started, by the server's clock. */
export const PATROL_STARTED_AT = '2026-11-08T12:00:00.000Z';

/** A 2 × 2 square walked as a circuit at 1 cell/s, turning, paused at its first cell (`step` 0):
 *  its cycle is (0,0) (1,0) (2,0) (2,1) (2,2) (1,2) (0,2) (0,1).
 *
 *  Example: `kael({ col: 0, row: 0, patrol: squarePatrol({ startedAt: PATROL_STARTED_AT }) })` */
export function squarePatrol(overrides: Partial<TokenPatrolDto> = {}): TokenPatrolDto {
  return {
    path: [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ],
    repeat: 'loop',
    speed: 1,
    turns: true,
    gait: 'glide',
    step: 0,
    startedAt: null,
    ...overrides,
  };
}

/** `token:patrolsChanged` on the group grid of Vharn at `version`.
 *
 *  Example: `patrolsChangedAt(5, [{ tokenId: KAEL_ID, patrol: squarePatrol(), col: 0, row: 0, facing: 0 }])` */
export function patrolsChangedAt(
  version: number,
  changes: TokenPatrolsChangedDto['changes'],
  at = PATROL_STARTED_AT,
): TokenPatrolsChangedDto {
  return { ...VHARN_GRID, version, at, changes };
}
