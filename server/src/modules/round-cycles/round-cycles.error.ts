export type RoundCycleErrorCode =
  | 'ROUND_CYCLE_NOT_FOUND'
  | 'ROUND_CYCLE_LIMIT'
  | 'ROUND_CYCLE_MEMBER_NOT_PLAYER'
  | 'ROUND_CYCLE_HOLDER_NOT_FOUND'
  | 'ROUND_CYCLE_NOT_ACTIVE'
  | 'ROUND_CYCLE_PHASE_NOT_FOUND';

/** Every round cycle refusal of its own; the board edge turns `code` into the ack error. */
export class RoundCycleError extends Error {
  constructor(
    readonly code: RoundCycleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RoundCycleError';
  }
}

// Also for a cycle of another table: telling them apart leaks which ids exist (§2.6).
export class RoundCycleNotFoundError extends RoundCycleError {
  constructor(campaignId: string, cycleId: string) {
    super('ROUND_CYCLE_NOT_FOUND', `campaign ${campaignId} has no round cycle ${cycleId}`);
  }
}

export class RoundCycleLimitError extends RoundCycleError {
  constructor(campaignId: string, limit: number) {
    super(
      'ROUND_CYCLE_LIMIT',
      `campaign ${campaignId} already has ${limit} round cycles; expected at most ${limit}`,
    );
  }
}

// Masters see every cycle anyway, and a spectator gets no room of their own to be told in.
export class RoundCycleMemberNotPlayerError extends RoundCycleError {
  constructor(userId: string) {
    super(
      'ROUND_CYCLE_MEMBER_NOT_PLAYER',
      `user ${userId} is not a player of the table; expected seers and choosers among its players`,
    );
  }
}

export class RoundCycleHolderNotFoundError extends RoundCycleError {
  constructor(campaignId: string, kind: 'character' | 'token', holderId: string) {
    super(
      'ROUND_CYCLE_HOLDER_NOT_FOUND',
      `campaign ${campaignId} has no ${kind === 'token' ? 'loose token' : 'character'} ${holderId} to hold a round cycle`,
    );
  }
}

export class RoundCycleNotActiveError extends RoundCycleError {
  constructor(cycleId: string, sceneId: string) {
    super(
      'ROUND_CYCLE_NOT_ACTIVE',
      `round cycle ${cycleId} is not in a combat of scene ${sceneId}; expected a combat it plays in`,
    );
  }
}

export class RoundCyclePhaseNotFoundError extends RoundCycleError {
  constructor(cycleId: string, phaseId: string) {
    super(
      'ROUND_CYCLE_PHASE_NOT_FOUND',
      `round cycle ${cycleId} has no phase ${phaseId}; expected one of its phases or null`,
    );
  }
}
