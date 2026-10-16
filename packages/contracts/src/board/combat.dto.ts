import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import { activeConditionDto } from './condition.dto';

/** The initiative range (the game-core `INITIATIVE_LIMIT`); `null` = not rolled yet. */
export const INITIATIVE_MAX = 999;
export const MAX_COMBATANTS = 64;

const initiativeDto = z.number().int().min(-INITIATIVE_MAX).max(INITIATIVE_MAX).nullable();
const tokenIdsDto = z.array(z.uuid()).min(1).max(MAX_COMBATANTS);

export const combatantDto = z.strictObject({
  id: z.uuid(),
  tokenId: z.uuid(),
  initiative: initiativeDto,
  /** Place among equal initiatives: the order of entry, changed by the master's ↑/↓. */
  tieOrder: z.number().int().nonnegative(),
});
export type CombatantDto = z.infer<typeof combatantDto>;

/** The combat of the scene; `combatants` come already in turn order (game-core). */
export const combatDto = z.strictObject({
  id: z.uuid(),
  round: z.number().int().min(1),
  currentCombatantId: z.uuid().nullable(),
  combatants: z.array(combatantDto).max(MAX_COMBATANTS),
});
export type CombatDto = z.infer<typeof combatDto>;

/** `combat:start` (master): the chosen tokens enter in this order. */
export const startCombatCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenIds: tokenIdsDto,
});
export type StartCombatCommandDto = z.infer<typeof startCombatCommandDto>;

/** `combat:end` (master). */
export const endCombatCommandDto = z.strictObject(boardCommandShape);
export type EndCombatCommandDto = z.infer<typeof endCombatCommandDto>;

/** `combat:addCombatants` (master). */
export const addCombatantsCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenIds: tokenIdsDto,
});
export type AddCombatantsCommandDto = z.infer<typeof addCombatantsCommandDto>;

/** `combat:removeCombatant` (master). */
export const removeCombatantCommandDto = z.strictObject({
  ...boardCommandShape,
  combatantId: z.uuid(),
});
export type RemoveCombatantCommandDto = z.infer<typeof removeCombatantCommandDto>;

/** `combat:moveInTie` (master): ↑ / ↓ among equal initiatives. */
export const moveInTieCommandDto = z.strictObject({
  ...boardCommandShape,
  combatantId: z.uuid(),
  direction: z.enum(['up', 'down']),
});
export type MoveInTieCommandDto = z.infer<typeof moveInTieCommandDto>;

/** `combat:setInitiative` (master or whoever controls the token). */
export const setInitiativeCommandDto = z.strictObject({
  ...boardCommandShape,
  combatantId: z.uuid(),
  initiative: initiativeDto,
});
export type SetInitiativeCommandDto = z.infer<typeof setInitiativeCommandDto>;

/** `combat:nextTurn` / `combat:previousTurn`: `fromCombatantId` is whose turn the sender saw, so
 *  two quick "next" never skip two turns (`TURN_ALREADY_CHANGED`). */
export const turnCommandDto = z.strictObject({ ...boardCommandShape, fromCombatantId: z.uuid() });
export const nextTurnCommandDto = turnCommandDto;
export const previousTurnCommandDto = turnCommandDto;
export type TurnCommandDto = z.infer<typeof turnCommandDto>;

export const combatStartedDto = z.strictObject({ ...boardEventShape, combat: combatDto });
export type CombatStartedDto = z.infer<typeof combatStartedDto>;

export const combatUpdatedDto = z.strictObject({ ...boardEventShape, combat: combatDto });
export type CombatUpdatedDto = z.infer<typeof combatUpdatedDto>;

/** A token's conditions after the end of its turn (counted down, the expired gone). */
export const conditionChangeDto = z.strictObject({
  tokenId: z.uuid(),
  conditions: z.array(activeConditionDto),
});
export type ConditionChangeDto = z.infer<typeof conditionChangeDto>;

export const combatTurnChangedDto = z.strictObject({
  ...boardEventShape,
  combat: combatDto,
  conditionChanges: z.array(conditionChangeDto),
});
export type CombatTurnChangedDto = z.infer<typeof combatTurnChangedDto>;

export const combatEndedDto = z.strictObject(boardEventShape);
export type CombatEndedDto = z.infer<typeof combatEndedDto>;
