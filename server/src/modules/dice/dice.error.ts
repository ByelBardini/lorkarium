export type DiceErrorCode = 'INVALID_DICE_EXPRESSION';

/** Every dice refusal of its own; the edges (the dice gateway, the saved rolls routes) turn
 *  `code` into the ack error or the HTTP status. */
export class DiceError extends Error {
  constructor(
    readonly code: DiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DiceError';
  }
}

/** A piece the game-core cannot read; `part` counts from 1 for the person (null when the whole
 *  composition is refused, like too many dice). Shared by the roll and the saved rolls. */
export class InvalidDiceExpressionError extends DiceError {
  constructor(
    readonly part: number | null,
    readonly expression: string | null,
    readonly reason: string,
  ) {
    const where = part === null ? 'the roll' : `part ${part} ("${expression}")`;
    super('INVALID_DICE_EXPRESSION', `${where} cannot be read: ${reason}`);
  }
}
