import { z } from 'zod';
import type { TokenAuraKindDto } from '../board/token-aura.dto';
import { userPlanDto } from './user-plan.dto';

// A leaf apart from the grid (`plan-limits.ts`, which reads the technical ceilings of the board
// DTOs): the account and campaign DTOs embed the shape without closing an import cycle through
// `api-error.dto`.

/** Every kind of aura, in the order the editor offers them. */
export const AURA_KINDS = [
  'color',
  'effect',
  'image',
] as const satisfies readonly TokenAuraKindDto[];

const countCeiling = z.number().int().nonnegative();

/** The limits that apply, already resolved for the role and the plan: the server
 *  sends them in `/me` (the account's) and in the table info (the owner's), so the client never
 *  repeats the rule. `null` = no ceiling of plan. `plan` is the plan whose grid this is.
 *
 *  Example: `planLimitsDto.parse(PLAN_LIMITS.free).maxScenes // 5` */
export const planLimitsDto = z.strictObject({
  plan: userPlanDto,
  maxCampaigns: countCeiling.nullable(),
  maxStorageBytes: countCeiling.nullable(),
  maxPlayers: countCeiling.nullable(),
  maxMasters: countCeiling.nullable(),
  maxSpectators: countCeiling.nullable(),
  maxScenes: countCeiling.nullable(),
  maxLibraryMaps: countCeiling.nullable(),
  maxSheetTemplates: countCeiling.nullable(),
  maxNpcSheets: countCeiling.nullable(),
  maxDocumentTabs: countCeiling,
  maxLights: countCeiling,
  maxBarsPerToken: countCeiling,
  maxFormsPerToken: countCeiling,
  maxPatrols: countCeiling,
  maxSightBlockers: countCeiling,
  maxSavedRolls: countCeiling,
  maxSavedRollFolders: countCeiling,
  maxDiceModelsPerRoll: countCeiling,
  maxMapSide: countCeiling,
  maxBackgroundSide: countCeiling,
  auraKinds: z.array(z.enum(AURA_KINDS)).readonly(),
  sceneCopy: z.boolean(),
  conditionImage: z.boolean(),
  desktopWindows: z.boolean(),
  customColor: z.boolean(),
});
export type PlanLimits = z.infer<typeof planLimitsDto>;
