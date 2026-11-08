import type { PatrolPauseDto, TokenDto, TokenPatrolChangeDto } from '@lorkarium/contracts';
import type { BoardEvent } from '@/services/board-events';

/** The tokens after `token:patrolsChanged`: each one listed takes its patrol (or none) and the pose
 *  saved with it; the others keep their reference.
 *
 *  Example: `withPatrolChanges(board.tokens, event.payload.changes)` */
export function withPatrolChanges(
  tokens: readonly TokenDto[],
  changes: readonly TokenPatrolChangeDto[],
): TokenDto[] {
  return tokens.map((token) => {
    const change = changes.find(({ tokenId }) => tokenId === token.id);
    if (!change) return token;
    const { patrol, col, row, facing } = change;
    return { ...token, patrol, col, row, facing };
  });
}

/** The tokens after the patrols an event paused: each one stops where the server saved it, its
 *  patrol off at the step it resumes from. A pause of a token not on this board is ignored, and
 *  with no pause the very array comes back.
 *
 *  Example: `withPatrolPauses(board.tokens, patrolPausesOf(event))` */
export function withPatrolPauses(
  tokens: readonly TokenDto[],
  pauses: readonly PatrolPauseDto[],
): readonly TokenDto[] {
  if (pauses.length === 0) return tokens;
  return tokens.map((token) => {
    const pause = pauses.find(({ tokenId }) => tokenId === token.id);
    return pause ? pausedToken(token, pause) : token;
  });
}

const NO_PAUSES: readonly PatrolPauseDto[] = [];

/** The patrols a moving, turning, resizing, form or combat event paused (none for the others).
 *
 *  Example: `patrolPausesOf({ type: 'tokenMoved', payload })` */
export function patrolPausesOf(event: BoardEvent): readonly PatrolPauseDto[] {
  const { payload } = event;
  if (!('patrolPauses' in payload)) return NO_PAUSES;
  return payload.patrolPauses ?? NO_PAUSES;
}

function pausedToken(token: TokenDto, { col, row, facing, step }: PatrolPauseDto): TokenDto {
  const patrol = token.patrol && { ...token.patrol, startedAt: null, step };
  return { ...token, col, row, facing, patrol };
}
