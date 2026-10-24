import { z } from 'zod';
import { realtimeAckFailureDto } from '../http/realtime-ack.dto';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import { tokenIdGroupDto } from './token-id-group.dto';

export const CONDITION_NAME_MAX_LENGTH = 32;
/** What the condition does, in the master's words: plain text, no rule attached (spec §3.7). */
export const CONDITION_DESCRIPTION_MAX_LENGTH = 500;
/** Rounds a condition may last; 0 on apply means "no limit". */
export const CONDITION_ROUNDS_MAX = 99;
/** The most stacks any condition piles up to; a condition's own `maxStacks` may be lower. */
export const CONDITION_STACKS_MAX = 99;

/** How many times a stacking condition piles up at most: 2 to 99. `null` on a definition = it
 *  does not stack (it only has a duration). */
export const conditionMaxStacksDto = z.number().int().min(2).max(CONDITION_STACKS_MAX);
/** The names of the conditions every table is born with, which `condition:restoreDefaults` brings
 *  back when missing (compared without case). The server keeps their tone, icon and look; the
 *  client only needs to know whether one is missing.
 *
 *  Example: `DEFAULT_CONDITION_NAMES.includes('Cego') // true` */
export const DEFAULT_CONDITION_NAMES = [
  'Abençoado',
  'Concentrando',
  'Invisível',
  'Agarrado',
  'Amedrontado',
  'Atordoado',
  'Caído',
  'Cego',
  'Envenenado',
  'Imobilizado',
  'Paralisado',
] as const;

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

/** The color the master picks for a condition, a closed palette (read on the dark board) so the
 *  client only ever paints a known color; the keys name the hue, the client holds the values.
 *  `null` = painted by its tone (gold for a benefit, the error color otherwise). */
export const CONDITION_COLORS = [
  'gold',
  'amber',
  'ember',
  'crimson',
  'rose',
  'violet',
  'indigo',
  'sky',
  'teal',
  'moss',
  'lime',
  'bone',
] as const;
export const conditionColorDto = z.enum(CONDITION_COLORS);
export type ConditionColorDto = z.infer<typeof conditionColorDto>;

/** A condition of the table's list ("Envenenado", "Abençoado"…); `description` is `''` when the
 *  master wrote none. */
export const conditionDefinitionDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  tone: conditionToneDto,
  icon: conditionIconDto,
  look: conditionLookDto.nullable(),
  color: conditionColorDto.nullable(),
  description: z.string(),
  maxStacks: conditionMaxStacksDto.nullable(),
});
export type ConditionDefinitionDto = z.infer<typeof conditionDefinitionDto>;

/** A condition on a token; `remainingRounds: null` lasts until removed. `stacks` is how many
 *  times it piled up (always 1 on a condition that does not stack: `maxStacks: null`). */
export const activeConditionDto = z.strictObject({
  id: z.uuid(),
  conditionId: z.uuid(),
  name: z.string(),
  tone: conditionToneDto,
  icon: conditionIconDto,
  look: conditionLookDto.nullable(),
  color: conditionColorDto.nullable(),
  description: z.string(),
  maxStacks: conditionMaxStacksDto.nullable(),
  stacks: z.number().int().min(1).max(CONDITION_STACKS_MAX),
  remainingRounds: z.number().int().min(1).max(CONDITION_ROUNDS_MAX).nullable(),
});
export type ActiveConditionDto = z.infer<typeof activeConditionDto>;

/** `condition:define` (master): a new condition on the table's list; without `look` it only
 *  shows as an icon, without `description` it has none.
 *
 *  Example: `defineConditionCommandDto.parse({ actionId, campaignId, name: 'Inconsciente', tone: 'incapacitating', icon: 'moon', look: 'unconscious' })` */
const conditionNameDto = z.string().trim().min(1).max(CONDITION_NAME_MAX_LENGTH);
const conditionDescriptionDto = z.string().trim().max(CONDITION_DESCRIPTION_MAX_LENGTH);

export const defineConditionCommandDto = z.strictObject({
  ...boardCommandShape,
  name: conditionNameDto,
  tone: conditionToneDto,
  icon: conditionIconDto,
  look: conditionLookDto.nullable().default(null),
  color: conditionColorDto.nullable().default(null),
  description: conditionDescriptionDto.default(''),
  maxStacks: conditionMaxStacksDto.nullable().default(null),
});
export type DefineConditionCommandDto = z.infer<typeof defineConditionCommandDto>;

/** `condition:updateDefinition` (master): the whole definition replaces the one saved — the
 *  conditions on the tokens follow it, they only point at it. Every field is required, so an
 *  older client cannot wipe the description by leaving it out.
 *
 *  Example: `updateConditionDefinitionCommandDto.parse({ actionId, campaignId, conditionId, name: 'Envenenado', tone: 'harm', icon: 'flask-conical', look: null, description: 'Desvantagem em ataques.' })` */
export const updateConditionDefinitionCommandDto = z.strictObject({
  ...boardCommandShape,
  conditionId: z.uuid(),
  name: conditionNameDto,
  tone: conditionToneDto,
  icon: conditionIconDto,
  look: conditionLookDto.nullable(),
  color: conditionColorDto.nullable(),
  description: conditionDescriptionDto,
  maxStacks: conditionMaxStacksDto.nullable(),
});
export type UpdateConditionDefinitionCommandDto = z.infer<
  typeof updateConditionDefinitionCommandDto
>;

/** `condition:deleteDefinition` (master): the condition leaves the list and every token.
 *
 *  Example: `deleteConditionDefinitionCommandDto.parse({ actionId, campaignId, conditionId })` */
export const deleteConditionDefinitionCommandDto = z.strictObject({
  ...boardCommandShape,
  conditionId: z.uuid(),
});
export type DeleteConditionDefinitionCommandDto = z.infer<
  typeof deleteConditionDefinitionCommandDto
>;

/** `condition:restoreDefaults` (master): the default conditions missing from the list come back
 *  (by name); the edited ones and the master's own stay as they are.
 *
 *  Example: `restoreDefaultConditionsCommandDto.parse({ actionId, campaignId })` */
export const restoreDefaultConditionsCommandDto = z.strictObject({ ...boardCommandShape });
export type RestoreDefaultConditionsCommandDto = z.infer<typeof restoreDefaultConditionsCommandDto>;

/** `condition:usage` (master, a read): how many tokens of the table hold the condition, on every
 *  grid and the cast — what the delete confirmation tells.
 *
 *  Example: `conditionUsageCommandDto.parse({ actionId, campaignId, conditionId })` */
export const conditionUsageCommandDto = z.strictObject({
  ...boardCommandShape,
  conditionId: z.uuid(),
});
export type ConditionUsageCommandDto = z.infer<typeof conditionUsageCommandDto>;

/** Answer to `condition:usage`: the count of tokens, or the API error. */
export const conditionUsageAckDto = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), tokens: z.number().int().min(0) }),
  realtimeAckFailureDto,
]);
export type ConditionUsageAckDto = z.infer<typeof conditionUsageAckDto>;

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

/** `condition:setStacks` (master or a player): how many stacks the condition on the token has
 *  (1 up to its `maxStacks`; the rounds stay); the event is the usual `condition:applied`.
 *  Taking the last one off is `condition:remove`.
 *
 *  Example: `setConditionStacksCommandDto.parse({ actionId, campaignId, tokenId, activeConditionId, stacks: 2 })` */
export const setConditionStacksCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
  activeConditionId: z.uuid(),
  stacks: z.number().int().min(1).max(CONDITION_STACKS_MAX),
});
export type SetConditionStacksCommandDto = z.infer<typeof setConditionStacksCommandDto>;

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

/** `condition:definitionUpdated`: the definition as saved; every token holding it shows it so. */
export const conditionDefinitionUpdatedDto = z.strictObject({
  ...boardEventShape,
  definition: conditionDefinitionDto,
});
export type ConditionDefinitionUpdatedDto = z.infer<typeof conditionDefinitionUpdatedDto>;

/** `condition:definitionDeleted`: the condition left the list and every token. */
export const conditionDefinitionDeletedDto = z.strictObject({
  ...boardEventShape,
  conditionId: z.uuid(),
});
export type ConditionDefinitionDeletedDto = z.infer<typeof conditionDefinitionDeletedDto>;

/** `condition:defaultsRestored`: the default conditions that came back to the list. */
export const conditionDefaultsRestoredDto = z.strictObject({
  ...boardEventShape,
  definitions: z.array(conditionDefinitionDto),
});
export type ConditionDefaultsRestoredDto = z.infer<typeof conditionDefaultsRestoredDto>;
