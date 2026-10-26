import type { DiceRolledDto, DiceRolledSecretlyDto } from '@lorkarium/contracts';
import type { DiceAudience } from './dice-roll.bo';

/** Sends a roll to its table. Adapter in `server/src/infrastructure/dice-publisher/`. */
export interface DicePublisherPort {
  /** `dice:rolled` to the audience: the table's room, or the masters' and the roller's rooms. */
  rolled(event: DiceRolledDto, audience: DiceAudience): void;
  /** `dice:rolledSecretly` to everyone at the table outside a `masters` audience. */
  rolledSecretly(notice: DiceRolledSecretlyDto, audience: DiceAudience): void;
}
