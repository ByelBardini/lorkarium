import { ASSET_MAX_SIDE } from '../assets/asset.dto';
import { LIGHTS_PER_SCENE_MAX } from '../board/light.dto';
import { TOKEN_FORMS_MAX } from '../board/token-form.dto';
import { TOKEN_PATROLS_RUNNING_MAX } from '../board/token-patrol.dto';
import { MAX_BARS_PER_TOKEN, TOKEN_SIGHT_BLOCKERS_PER_SCENE_MAX } from '../board/token.dto';
import { DICE_THROW_MODELS_MAX } from '../dice/dice.dto';
import { SAVED_ROLL_FOLDERS_MAX, SAVED_ROLLS_MAX } from '../dice/saved-roll.dto';
import { DOCUMENT_TABS_MAX } from '../documents/document-tab.dto';
import { AURA_KINDS, type PlanLimits } from './plan-limits.dto';
import type { PlanCountResource, UserPlan } from './user-plan.dto';

export { AURA_KINDS, planLimitsDto, type PlanLimits } from './plan-limits.dto';

const MEBIBYTE = 1024 * 1024;
const GIBIBYTE = 1024 * MEBIBYTE;

type PlanCountLimitKey = {
  [K in keyof PlanLimits]: PlanLimits[K] extends number | null ? K : never;
}[keyof PlanLimits];

/** The key of `PlanLimits` each count resource is checked against.
 *
 *  Example: `limits[PLAN_COUNT_LIMIT_KEY.scenes] // limits.maxScenes` */
export const PLAN_COUNT_LIMIT_KEY: Readonly<Record<PlanCountResource, PlanCountLimitKey>> = {
  campaigns: 'maxCampaigns',
  storage: 'maxStorageBytes',
  players: 'maxPlayers',
  masters: 'maxMasters',
  spectators: 'maxSpectators',
  scenes: 'maxScenes',
  libraryMaps: 'maxLibraryMaps',
  sheetTemplates: 'maxSheetTemplates',
  npcSheets: 'maxNpcSheets',
  documentTabs: 'maxDocumentTabs',
  lights: 'maxLights',
  tokenBars: 'maxBarsPerToken',
  tokenForms: 'maxFormsPerToken',
  patrols: 'maxPatrols',
  sightBlockers: 'maxSightBlockers',
  savedRolls: 'maxSavedRolls',
  savedRollFolders: 'maxSavedRollFolders',
};

// Amigo do Dono = today: no ceiling of plan, only the technical ones (performance; the client
// validates with the same constants).
const UNBOUNDED: PlanLimits = {
  plan: 'amigo_do_dono',
  maxCampaigns: null,
  maxStorageBytes: null,
  maxPlayers: null,
  maxMasters: null,
  maxSpectators: null,
  maxScenes: null,
  maxLibraryMaps: null,
  maxSheetTemplates: null,
  maxNpcSheets: null,
  maxDocumentTabs: DOCUMENT_TABS_MAX,
  maxLights: LIGHTS_PER_SCENE_MAX,
  maxBarsPerToken: MAX_BARS_PER_TOKEN,
  maxFormsPerToken: TOKEN_FORMS_MAX,
  maxPatrols: TOKEN_PATROLS_RUNNING_MAX,
  maxSightBlockers: TOKEN_SIGHT_BLOCKERS_PER_SCENE_MAX,
  maxSavedRolls: SAVED_ROLLS_MAX,
  maxSavedRollFolders: SAVED_ROLL_FOLDERS_MAX,
  maxDiceModelsPerRoll: DICE_THROW_MODELS_MAX,
  maxMapSide: ASSET_MAX_SIDE.library_map,
  maxBackgroundSide: ASSET_MAX_SIDE.background,
  auraKinds: AURA_KINDS,
  sceneCopy: true,
  conditionImage: true,
  desktopWindows: true,
  customColor: true,
};

const LENDA: PlanLimits = {
  ...UNBOUNDED,
  plan: 'lenda',
  maxCampaigns: 10,
  maxStorageBytes: 10 * GIBIBYTE,
  maxPlayers: 20,
  maxMasters: 5,
  maxSpectators: 50,
  maxScenes: 500,
  maxLibraryMaps: 100,
  maxSheetTemplates: 50,
  maxNpcSheets: 1000,
};

const NARRADOR: PlanLimits = {
  ...LENDA,
  plan: 'narrador',
  maxCampaigns: 5,
  maxStorageBytes: 2 * GIBIBYTE,
  maxPlayers: 10,
  maxMasters: 2,
  maxSpectators: 10,
  maxScenes: 20,
  maxLibraryMaps: 5,
  maxSheetTemplates: 5,
  maxNpcSheets: 50,
  maxDocumentTabs: 30,
  maxLights: 50,
  maxPatrols: 5,
  maxSightBlockers: 10,
  maxSavedRolls: 20,
};

const FREE: PlanLimits = {
  plan: 'free',
  maxCampaigns: 1,
  maxStorageBytes: 100 * MEBIBYTE,
  maxPlayers: 6,
  maxMasters: 1,
  maxSpectators: 2,
  maxScenes: 5,
  maxLibraryMaps: 1,
  maxSheetTemplates: 1,
  maxNpcSheets: 10,
  maxDocumentTabs: 5,
  maxLights: 15,
  maxBarsPerToken: 2,
  maxFormsPerToken: 2,
  maxPatrols: 0,
  maxSightBlockers: 0,
  maxSavedRolls: 5,
  maxSavedRollFolders: 0,
  maxDiceModelsPerRoll: 10,
  maxMapSide: 4096,
  maxBackgroundSide: 2048,
  auraKinds: ['color'],
  sceneCopy: false,
  conditionImage: false,
  desktopWindows: false,
  customColor: false,
};

/** The grid of each plan, as is (no role): the server resolves the effective limits
 *  in the `plans` module; the client reads this table only to show what each plan offers.
 *
 *  Example: `PLAN_LIMITS.narrador.maxScenes // 20` */
export const PLAN_LIMITS: Readonly<Record<UserPlan, PlanLimits>> = {
  free: FREE,
  // The Apoiador supports the house: its own account opens up, its tables stay on Grátis.
  apoiador: { ...FREE, plan: 'apoiador' },
  narrador: NARRADOR,
  lenda: LENDA,
  amigo_do_dono: UNBOUNDED,
};

/** The ceilings of "fair use": real, but the plan page shows them as "ilimitado".
 *
 *  Example: `PLAN_FAIR_USE_RESOURCES.lenda.includes('scenes') // true` */
export const PLAN_FAIR_USE_RESOURCES: Readonly<Record<UserPlan, readonly PlanCountResource[]>> = {
  free: [],
  apoiador: [],
  narrador: [],
  lenda: ['scenes', 'libraryMaps', 'sheetTemplates', 'npcSheets'],
  amigo_do_dono: [],
};
