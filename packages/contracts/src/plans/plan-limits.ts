import { ASSET_MAX_SIDE } from '../assets/asset.dto';
import { LIGHTS_PER_SCENE_MAX } from '../board/light.dto';
import { SAVED_TOKEN_FOLDERS_MAX, SAVED_TOKENS_MAX } from '../board/saved-token.dto';
import { TOKEN_FORMS_MAX } from '../board/token-form.dto';
import { TOKEN_PATROLS_RUNNING_MAX } from '../board/token-patrol.dto';
import { MAX_BARS_PER_TOKEN, TOKEN_SIGHT_BLOCKERS_PER_SCENE_MAX } from '../board/token.dto';
import { DICE_THROW_MODELS_MAX } from '../dice/dice.dto';
import { SAVED_ROLL_FOLDERS_MAX, SAVED_ROLLS_MAX } from '../dice/saved-roll.dto';
import { DOCUMENT_TABS_MAX } from '../documents/document-tab.dto';
import { AURA_KINDS, type PlanLimits } from './plan-limits.dto';
import type { PlanCountResource, PlanLimitHolder, UserPlan } from './user-plan.dto';

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
  savedTokens: 'maxSavedTokens',
  savedTokenFolders: 'maxSavedTokenFolders',
  customEmojis: 'maxCustomEmojis',
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
  maxSavedTokens: SAVED_TOKENS_MAX,
  maxSavedTokenFolders: SAVED_TOKEN_FOLDERS_MAX,
  maxDiceModelsPerRoll: DICE_THROW_MODELS_MAX,
  maxMapSide: ASSET_MAX_SIDE.library_map,
  maxBackgroundSide: ASSET_MAX_SIDE.background,
  auraKinds: AURA_KINDS,
  sceneCopy: true,
  conditionImage: true,
  desktopWindows: true,
  customColor: true,
  campaignArt: true,
  animatedCampaignArt: true,
  privateCampaign: true,
  sheetScripts: true,
  profileBanner: true,
  magicSight: true,
  maxCustomEmojis: null,
  animatedCustomEmojis: true,
};

const LENDA: PlanLimits = {
  ...UNBOUNDED,
  plan: 'lenda',
  maxCampaigns: 10,
  maxStorageBytes: 5 * GIBIBYTE,
  maxPlayers: 20,
  maxMasters: 5,
  maxSpectators: 50,
  maxScenes: 500,
  maxLibraryMaps: 100,
  maxSheetTemplates: 50,
  maxNpcSheets: 1000,
  maxCustomEmojis: 50,
};

// The middle step: everything a table of one or two fixed groups needs, the Lenda keeping more
// of every count and the extras of a dedicated master (desktop windows, effect and image auras,
// animated table art).
const NARRADOR: PlanLimits = {
  ...LENDA,
  plan: 'narrador',
  maxCampaigns: 3,
  maxStorageBytes: GIBIBYTE,
  maxPlayers: 8,
  maxMasters: 2,
  maxSpectators: 5,
  maxScenes: 15,
  maxLibraryMaps: 3,
  maxSheetTemplates: 3,
  maxNpcSheets: 30,
  maxDocumentTabs: 10,
  maxLights: 30,
  maxBarsPerToken: 4,
  maxFormsPerToken: 4,
  maxPatrols: 3,
  maxSightBlockers: 5,
  maxSavedRolls: 15,
  maxSavedRollFolders: 5,
  maxSavedTokens: 20,
  maxSavedTokenFolders: 5,
  maxDiceModelsPerRoll: 15,
  auraKinds: ['color'],
  desktopWindows: false,
  animatedCampaignArt: false,
  profileBanner: false,
  maxCustomEmojis: 25,
  animatedCustomEmojis: false,
};

const FREE: PlanLimits = {
  plan: 'free',
  maxCampaigns: 1,
  maxStorageBytes: 100 * MEBIBYTE,
  maxPlayers: 5,
  maxMasters: 1,
  maxSpectators: 1,
  maxScenes: 3,
  maxLibraryMaps: 0,
  maxSheetTemplates: 1,
  maxNpcSheets: 5,
  maxDocumentTabs: 3,
  maxLights: 10,
  maxBarsPerToken: 1,
  maxFormsPerToken: 2,
  maxPatrols: 0,
  maxSightBlockers: 0,
  maxSavedRolls: 3,
  maxSavedRollFolders: 0,
  maxSavedTokens: 0,
  maxSavedTokenFolders: 0,
  maxDiceModelsPerRoll: 8,
  maxMapSide: 4096,
  maxBackgroundSide: 2048,
  auraKinds: ['color'],
  sceneCopy: false,
  conditionImage: false,
  desktopWindows: false,
  customColor: false,
  campaignArt: false,
  animatedCampaignArt: false,
  privateCampaign: false,
  sheetScripts: false,
  profileBanner: false,
  magicSight: false,
  maxCustomEmojis: 0,
  animatedCustomEmojis: false,
};

/** The grid of each plan, as is (no role): the server resolves the effective limits
 *  in the `plans` module; the client reads this table only to show what each plan offers.
 *
 *  Example: `PLAN_LIMITS.narrador.maxScenes // 15` */
export const PLAN_LIMITS: Readonly<Record<UserPlan, PlanLimits>> = {
  free: FREE,
  // The Apoiador supports the house: its own account opens up (custom emojis included), its
  // tables stay on Grátis.
  apoiador: { ...FREE, plan: 'apoiador', maxCustomEmojis: 10 },
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

type PersonalCountKey = {
  [K in keyof PlanLimits]: PlanLimits[K] extends number ? K : never;
}[keyof PlanLimits];

/** The ceilings a person carries to any table, the first key deciding who wins. */
type PersonalCeilings<K extends PersonalCountKey> = Readonly<Pick<PlanLimits, K>>;

function ceilingsOf<K extends PersonalCountKey>(
  limits: PlanLimits,
  keys: readonly K[],
): PersonalCeilings<K> {
  return Object.fromEntries(keys.map((key) => [key, limits[key]])) as PersonalCeilings<K>;
}

/** The limits a member's own items (saved rolls, saved tokens) are checked against, and whose
 *  they are. */
export type MemberPlanLimits = Readonly<{ limits: PlanLimits; holder: PlanLimitHolder }>;
export type SavedRollLimits = MemberPlanLimits;

// The grids grow together on every key of a group, so the first key alone picks the winner; a tie
// stays with the table, and only the keys of the group come from the person.
function memberLimitsOf<K extends PersonalCountKey>(
  table: PlanLimits,
  personal: PersonalCeilings<K>,
  personalPlan: UserPlan,
  decidingKey: K,
): MemberPlanLimits {
  if (personal[decidingKey] <= table[decidingKey]) return { limits: table, holder: 'table' };
  return { limits: { ...table, ...personal, plan: personalPlan }, holder: 'account' };
}

const ROLL_KEYS = ['maxSavedRolls', 'maxSavedRollFolders'] as const;
const TOKEN_KEYS = ['maxSavedTokens', 'maxSavedTokenFolders'] as const;

/** The saved rolls and folders a person keeps at a table. */
export type SavedRollCeilings = PersonalCeilings<(typeof ROLL_KEYS)[number]>;
/** The saved tokens and folders a person keeps at a table. */
export type SavedTokenCeilings = PersonalCeilings<(typeof TOKEN_KEYS)[number]>;

/** What each plan gives its own holder at any table, whoever owns it: the grid of the plan, but
 *  the Apoiador, whose tables stay on Grátis, keeps the rolls of the Narrador for itself.
 *
 *  Example: `PERSONAL_SAVED_ROLL_LIMITS.apoiador.maxSavedRolls // 15` */
export const PERSONAL_SAVED_ROLL_LIMITS: Readonly<Record<UserPlan, SavedRollCeilings>> = {
  free: ceilingsOf(FREE, ROLL_KEYS),
  apoiador: ceilingsOf(NARRADOR, ROLL_KEYS),
  narrador: ceilingsOf(NARRADOR, ROLL_KEYS),
  lenda: ceilingsOf(LENDA, ROLL_KEYS),
  amigo_do_dono: ceilingsOf(UNBOUNDED, ROLL_KEYS),
};

/** The saved tokens each plan gives its own holder at any table: the grid of the plan, but the
 *  Apoiador (whose tables give none) keeps 5 tokens and 2 folders for itself.
 *
 *  Example: `PERSONAL_SAVED_TOKEN_LIMITS.apoiador.maxSavedTokens // 5` */
export const PERSONAL_SAVED_TOKEN_LIMITS: Readonly<Record<UserPlan, SavedTokenCeilings>> = {
  free: ceilingsOf(FREE, TOKEN_KEYS),
  apoiador: { maxSavedTokens: 5, maxSavedTokenFolders: 2 },
  narrador: ceilingsOf(NARRADOR, TOKEN_KEYS),
  lenda: ceilingsOf(LENDA, TOKEN_KEYS),
  amigo_do_dono: ceilingsOf(UNBOUNDED, TOKEN_KEYS),
};

/** The saved rolls of a member: the greater of the table's grid and the person's own (a tie
 *  stays with the table). The other keys are the table's; `plan` names the grid that won.
 *
 *  Example: `savedRollLimitsOf(PLAN_LIMITS.free, 'apoiador').limits.maxSavedRolls // 15` */
export function savedRollLimitsOf(table: PlanLimits, personalPlan: UserPlan): SavedRollLimits {
  const personal = PERSONAL_SAVED_ROLL_LIMITS[personalPlan];
  return memberLimitsOf(table, personal, personalPlan, 'maxSavedRolls');
}

/** The saved tokens of a member, by the same rule as the saved rolls.
 *
 *  Example: `savedTokenLimitsOf(PLAN_LIMITS.free, 'apoiador').limits.maxSavedTokens // 5` */
export function savedTokenLimitsOf(table: PlanLimits, personalPlan: UserPlan): MemberPlanLimits {
  const personal = PERSONAL_SAVED_TOKEN_LIMITS[personalPlan];
  return memberLimitsOf(table, personal, personalPlan, 'maxSavedTokens');
}
