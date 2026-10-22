import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import { tokenIdGroupDto } from './token-id-group.dto';

export const CONDITION_NAME_MAX_LENGTH = 32;
/** Rounds a condition may last; 0 on apply means "no limit". */
export const CONDITION_ROUNDS_MAX = 99;

/** How heavy the condition weighs on the turn: benefit (gold mark), harm (destructive mark) or
 *  incapacitating (filled destructive mark). A marker, no rule attached (spec §3.7). */
export const conditionToneDto = z.enum(['benefit', 'harm', 'incapacitating']);
export type ConditionToneDto = z.infer<typeof conditionToneDto>;

/** How the condition changes the token itself: translucent (`invisible`) or greyed out
 *  (`unconscious`). `null` on a definition = it only shows as an icon. */
export const conditionLookDto = z.enum(['unconscious', 'invisible']);
export type ConditionLookDto = z.infer<typeof conditionLookDto>;

/** The icon of a condition, a closed list so the client only ever draws a known glyph. The keys
 *  are the client icon set's names (lucide). */
export const CONDITION_ICONS = [
  'circle-dot',
  'skull',
  'eye-off',
  'flask-conical',
  'ghost',
  'shield',
  'sparkles',
  'link',
  'zap',
  'flame',
  'snowflake',
  'moon',
  'crosshair',
  'arrow-down-to-line',
  'hand',
  'heart',
  'droplet',
  'brain',
  'footprints',
  'lock',
  'ear-off',
  'angry',
  'swords',
  'wind',
  'sun',
  'biohazard',
  'hourglass',
  'anchor',
] as const;
export const conditionIconDto = z.enum(CONDITION_ICONS);
export type ConditionIconDto = z.infer<typeof conditionIconDto>;

/** A condition of the table's list ("Envenenado", "Abençoado"…). */
export const conditionDefinitionDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  tone: conditionToneDto,
  icon: conditionIconDto,
  look: conditionLookDto.nullable(),
});
export type ConditionDefinitionDto = z.infer<typeof conditionDefinitionDto>;

/** A condition on a token; `remainingRounds: null` lasts until removed. */
export const activeConditionDto = z.strictObject({
  id: z.uuid(),
  conditionId: z.uuid(),
  name: z.string(),
  tone: conditionToneDto,
  icon: conditionIconDto,
  look: conditionLookDto.nullable(),
  remainingRounds: z.number().int().min(1).max(CONDITION_ROUNDS_MAX).nullable(),
});
export type ActiveConditionDto = z.infer<typeof activeConditionDto>;

/** `condition:define` (master): a new condition on the table's list; without `look` it only
 *  shows as an icon.
 *
 *  Example: `defineConditionCommandDto.parse({ actionId, campaignId, name: 'Inconsciente', tone: 'incapacitating', icon: 'moon', look: 'unconscious' })` */
export const defineConditionCommandDto = z.strictObject({
  ...boardCommandShape,
  name: z.string().trim().min(1).max(CONDITION_NAME_MAX_LENGTH),
  tone: conditionToneDto,
  icon: conditionIconDto,
  look: conditionLookDto.nullable().default(null),
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

/** `condition:applyMany` (master or a controller of every token): one condition on 1 to 64
 *  tokens, all or nothing, one version.
 *
 *  Example: `applyConditionsCommandDto.parse({ actionId, campaignId, tokenIds: [a, b], conditionId, rounds: 0 })` */
export const applyConditionsCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenIds: tokenIdGroupDto,
  conditionId: z.uuid(),
  rounds: z.number().int().min(0).max(CONDITION_ROUNDS_MAX),
});
export type ApplyConditionsCommandDto = z.infer<typeof applyConditionsCommandDto>;

/** `condition:remove` (master or a controller). */
export const removeConditionCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
  activeConditionId: z.uuid(),
});
export type RemoveConditionCommandDto = z.infer<typeof removeConditionCommandDto>;

/** `condition:setRounds` (master or a controller): only the rounds left change (0 = no limit);
 *  the round it was applied in stays, so it does not last one round longer.
 *
 *  Example: `setConditionRoundsCommandDto.parse({ actionId, campaignId, tokenId, activeConditionId, rounds: 2 })` */
export const setConditionRoundsCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
  activeConditionId: z.uuid(),
  rounds: z.number().int().min(0).max(CONDITION_ROUNDS_MAX),
});
export type SetConditionRoundsCommandDto = z.infer<typeof setConditionRoundsCommandDto>;

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

const tokenConditionDto = z.strictObject({ tokenId: z.uuid(), condition: activeConditionDto });
export type TokenConditionDto = z.infer<typeof tokenConditionDto>;

/** `condition:appliedMany`: what `condition:applyMany` left on each token, in one version. */
export const conditionsAppliedDto = z.strictObject({
  ...boardEventShape,
  applied: z.array(tokenConditionDto),
});
export type ConditionsAppliedDto = z.infer<typeof conditionsAppliedDto>;

export const conditionRemovedDto = z.strictObject({
  ...boardEventShape,
  tokenId: z.uuid(),
  activeConditionId: z.uuid(),
});
export type ConditionRemovedDto = z.infer<typeof conditionRemovedDto>;
