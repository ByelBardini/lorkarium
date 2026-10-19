import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import { activeConditionDto } from './condition.dto';
import { firstRepeated, tokenIdGroupDto } from './token-id-group.dto';

/** The initiative range (the game-core `INITIATIVE_LIMIT`); `null` = not rolled yet. */
export const INITIATIVE_MAX = 999;
export const MAX_COMBATANTS = 64;
/** Tokens one initiative entry may hold (every enemy of a scene acting at once). */
export const MAX_ENTRY_TOKENS = 64;
export const COMBATANT_NAME_MAX_LENGTH = 40;

const initiativeDto = z.number().int().min(-INITIATIVE_MAX).max(INITIATIVE_MAX).nullable();
const combatantNameDto = z.string().trim().min(1).max(COMBATANT_NAME_MAX_LENGTH);

/** One initiative entry as the master builds it: 0 to 64 tokens acting at once, and a name the
 *  master gave (`null` = the screen names it after its tokens; required with no token).
 *
 *  Example: `combatEntryInputDto.parse({ name: 'Inimigos', tokenIds: [goblin, wolf] })` */
export const combatEntryInputDto = z
  .strictObject({
    name: combatantNameDto.nullable(),
    tokenIds: z.array(z.uuid()).max(MAX_ENTRY_TOKENS),
  })
  .superRefine((entry, context) => {
    if (entry.tokenIds.length === 0 && entry.name === null) {
      context.addIssue({
        code: 'custom',
        message: 'combat entry without tokens needs a name; got name null',
      });
    }
    const repeated = firstRepeated(entry.tokenIds);
    if (repeated === undefined) return;
    context.addIssue({
      code: 'custom',
      message: `token ${repeated} appears more than once in the entry; expected distinct token ids`,
    });
  });
export type CombatEntryInput = z.infer<typeof combatEntryInputDto>;

/** The entries of `combat:start` / `combat:addCombatants`: 1 to 64, a token in at most one.
 *
 *  Example: `combatEntriesDto.parse([{ name: null, tokenIds: [kael] }])` */
export const combatEntriesDto = z
  .array(combatEntryInputDto)
  .min(1)
  .max(MAX_COMBATANTS)
  .superRefine((entries, context) => {
    const repeated = firstRepeated(entries.flatMap((entry) => entry.tokenIds));
    if (repeated === undefined) return;
    context.addIssue({
      code: 'custom',
      message: `token ${repeated} is in more than one entry; expected each token in one entry`,
    });
  });

export const combatantDto = z.strictObject({
  id: z.uuid(),
  name: z.string().nullable(),
  /** The order is not part of the contract: the client sorts by name. */
  tokenIds: z.array(z.uuid()).max(MAX_ENTRY_TOKENS),
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

/** `combat:start` (master): the entries enter in this order.
 *
 *  Example: `startCombatCommandDto.parse({ actionId, campaignId, entries: [{ name: null, tokenIds: [kael] }] })` */
export const startCombatCommandDto = z.strictObject({
  ...boardCommandShape,
  entries: combatEntriesDto,
});
export type StartCombatCommandDto = z.infer<typeof startCombatCommandDto>;

/** `combat:end` (master). */
export const endCombatCommandDto = z.strictObject(boardCommandShape);
export type EndCombatCommandDto = z.infer<typeof endCombatCommandDto>;

/** `combat:addCombatants` (master): the entries enter after the ones already there. */
export const addCombatantsCommandDto = z.strictObject({
  ...boardCommandShape,
  entries: combatEntriesDto,
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

/** Where `combat:regroupTokens` sends the tokens: into an entry, each into its own, or out. */
export const regroupTargetDto = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('entry'), combatantId: z.uuid() }),
  z.strictObject({ kind: z.literal('own') }),
  z.strictObject({ kind: z.literal('out') }),
]);
export type RegroupTargetDto = z.infer<typeof regroupTargetDto>;

/** `combat:regroupTokens` (master): moves, splits or takes tokens out of their entries.
 *
 *  Example: `regroupTokensCommandDto.parse({ actionId, campaignId, tokenIds: [wolf], target: { kind: 'own' } })` */
export const regroupTokensCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenIds: tokenIdGroupDto,
  target: regroupTargetDto,
});
export type RegroupTokensCommandDto = z.infer<typeof regroupTokensCommandDto>;

/** `combat:renameCombatant` (master). */
export const renameCombatantCommandDto = z.strictObject({
  ...boardCommandShape,
  combatantId: z.uuid(),
  name: combatantNameDto,
});
export type RenameCombatantCommandDto = z.infer<typeof renameCombatantCommandDto>;

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
