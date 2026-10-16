export type CombatErrorCode =
  'COMBAT_NOT_ACTIVE' | 'COMBAT_ALREADY_ACTIVE' | 'TURN_ALREADY_CHANGED' | 'COMBATANT_NOT_FOUND';

/** Every combat refusal of its own; the gateway turns `code` into the ack error. */
export class CombatError extends Error {
  constructor(
    readonly code: CombatErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CombatError';
  }
}

export class CombatNotActiveError extends CombatError {
  constructor(readonly campaignId: string) {
    super('COMBAT_NOT_ACTIVE', `campaign ${campaignId} has no combat in its scene`);
  }
}

export class CombatAlreadyActiveError extends CombatError {
  constructor(readonly combatId: string) {
    super('COMBAT_ALREADY_ACTIVE', `the scene already has combat ${combatId}; end it first`);
  }
}

// "Next turn" from the master and "Passar a vez" from the player at once must move it once.
export class TurnAlreadyChangedError extends CombatError {
  constructor(
    readonly fromCombatantId: string,
    readonly currentCombatantId: string | null,
  ) {
    super(
      'TURN_ALREADY_CHANGED',
      `the turn was asked to move from ${fromCombatantId}, but it is ${currentCombatantId ?? 'nobody'}'s`,
    );
  }
}

export class CombatantNotFoundError extends CombatError {
  constructor(
    readonly combatId: string,
    readonly combatantId: string,
  ) {
    super('COMBATANT_NOT_FOUND', `combat ${combatId} has no combatant ${combatantId}`);
  }
}
