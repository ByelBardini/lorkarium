import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';

export const CONDITION_NAME_MAX_LENGTH = 32;
/** Rounds a condition may last; 0 on apply means "no limit". */
export const CONDITION_ROUNDS_MAX = 99;

/** Benefit (gold mark) or harm (destructive mark): a marker, no rule attached (spec §3.7). */
export const conditionToneDto = z.enum(['benefit', 'harm']);
export type ConditionToneDto = z.infer<typeof conditionToneDto>;

/** A condition of the table's list ("Envenenado", "Abençoado"…). */
export const conditionDefinitionDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  tone: conditionToneDto,
});
export type ConditionDefinitionDto = z.infer<typeof conditionDefinitionDto>;

/** A condition on a token; `remainingRounds: null` lasts until removed. */
export const activeConditionDto = z.strictObject({
  id: z.uuid(),
  conditionId: z.uuid(),
  name: z.string(),
  tone: conditionToneDto,
  remainingRounds: z.number().int().min(1).max(CONDITION_ROUNDS_MAX).nullable(),
});
export type ActiveConditionDto = z.infer<typeof activeConditionDto>;

/** `condition:define` (master): a new condition on the table's list. */
export const defineConditionCommandDto = z.strictObject({
  ...boardCommandShape,
  name: z.string().trim().min(1).max(CONDITION_NAME_MAX_LENGTH),
  tone: conditionToneDto,
});
export type DefineConditionCommandDto = z.infer<typeof defineConditionCommandDto>;

/** `condition:apply` (master or a controller); applying again replaces the duration. */
export const applyConditionCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
  conditionId: z.uuid(),
  rounds: z.number().int().min(0).max(CONDITION_ROUNDS_MAX),
});
export type ApplyConditionCommandDto = z.infer<typeof applyConditionCommandDto>;

/** `condition:remove` (master or a controller). */
export const removeConditionCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
  activeConditionId: z.uuid(),
});
export type RemoveConditionCommandDto = z.infer<typeof removeConditionCommandDto>;

export const conditionDefinedDto = z.strictObject({
  ...boardEventShape,
  definition: conditionDefinitionDto,
});
export type ConditionDefinedDto = z.infer<typeof conditionDefinedDto>;

export const conditionAppliedDto = z.strictObject({
  ...boardEventShape,
  tokenId: z.uuid(),
  condition: activeConditionDto,
});
export type ConditionAppliedDto = z.infer<typeof conditionAppliedDto>;

export const conditionRemovedDto = z.strictObject({
  ...boardEventShape,
  tokenId: z.uuid(),
  activeConditionId: z.uuid(),
});
export type ConditionRemovedDto = z.infer<typeof conditionRemovedDto>;
