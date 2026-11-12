import { describe, expect, it } from 'vitest';
import { ASSET_MAX_SIDE } from '../../src/assets/asset.dto';
import { LIGHTS_PER_SCENE_MAX } from '../../src/board/light.dto';
import { TOKEN_FORMS_MAX } from '../../src/board/token-form.dto';
import { TOKEN_PATROLS_RUNNING_MAX } from '../../src/board/token-patrol.dto';
import { MAX_BARS_PER_TOKEN, TOKEN_SIGHT_BLOCKERS_PER_SCENE_MAX } from '../../src/board/token.dto';
import { DICE_THROW_MODELS_MAX } from '../../src/dice/dice.dto';
import { SAVED_ROLL_FOLDERS_MAX, SAVED_ROLLS_MAX } from '../../src/dice/saved-roll.dto';
import { DOCUMENT_TABS_MAX } from '../../src/documents/document-tab.dto';
import { apiErrorDto } from '../../src/http/api-error.dto';
import {
  PLAN_COUNT_LIMIT_KEY,
  PLAN_FAIR_USE_RESOURCES,
  PLAN_LIMITS,
  planLimitsDto,
  type PlanLimits,
} from '../../src/plans/plan-limits';
import { USER_PLANS, userPlanDto } from '../../src/plans/user-plan.dto';

type NumericKey = {
  [K in keyof PlanLimits]: PlanLimits[K] extends number | null ? K : never;
}[keyof PlanLimits];

const NUMERIC_KEYS = Object.keys(PLAN_LIMITS.free).filter(
  (key) => typeof PLAN_LIMITS.free[key as keyof PlanLimits] === 'number',
) as NumericKey[];

const PAID_ORDER = ['free', 'narrador', 'lenda'] as const;

describe('userPlanDto', () => {
  it('accepts a plan of the list', () => {
    expect(userPlanDto.parse('lenda')).toBe('lenda');
  });

  it('lists the plans cheapest first, the Apoiador right after Grátis', () => {
    expect(USER_PLANS).toEqual(['free', 'apoiador', 'narrador', 'lenda', 'amigo_do_dono']);
  });

  it('refuses a plan out of the list, citing the value received', () => {
    const result = userPlanDto.safeParse('pro');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('pro');
  });
});

describe('PLAN_LIMITS', () => {
  it('gives every plan every key of PlanLimits, none undefined, and names its own plan', () => {
    for (const plan of USER_PLANS) {
      const limits = planLimitsDto.parse(PLAN_LIMITS[plan]);
      expect(limits.plan).toBe(plan);
      expect(Object.values(limits)).not.toContain(undefined);
    }
  });

  it('every numeric ceiling grows or stays from Grátis to Narrador to Lenda', () => {
    for (const key of NUMERIC_KEYS) {
      const [free, narrador, lenda] = PAID_ORDER.map((plan) => PLAN_LIMITS[plan][key] as number);
      expect({ key, ordered: free! <= narrador! && narrador! <= lenda! }).toEqual({
        key,
        ordered: true,
      });
    }
    expect(PAID_ORDER.map((plan) => PLAN_LIMITS[plan].maxBarsPerToken)).toEqual([2, 8, 8]);
    expect(PAID_ORDER.map((plan) => PLAN_LIMITS[plan].maxCampaigns)).toEqual([1, 5, 10]);
  });

  it('in amigo_do_dono every technical ceiling is today constant and every count is null', () => {
    expect(PLAN_LIMITS.amigo_do_dono).toEqual({
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
      auraKinds: ['color', 'effect', 'image'],
      sceneCopy: true,
      conditionImage: true,
      desktopWindows: true,
      customColor: true,
    } satisfies PlanLimits);
  });

  it('Apoiador has the table limits of Grátis under its own name: only the account opens', () => {
    expect(PLAN_LIMITS.apoiador).toEqual({ ...PLAN_LIMITS.free, plan: 'apoiador' });
    expect(PLAN_LIMITS.apoiador.customColor).toBe(false);
  });

  it('Grátis keeps only the palette, the color aura and the smaller sides', () => {
    expect(PLAN_LIMITS.free).toMatchObject({
      maxMapSide: 4096,
      maxBackgroundSide: 2048,
      maxPatrols: 0,
      maxSightBlockers: 0,
      maxSavedRollFolders: 0,
      auraKinds: ['color'],
      sceneCopy: false,
      conditionImage: false,
      desktopWindows: false,
      customColor: false,
    });
  });

  it('every count resource points at a numeric key, and the fair use is only Lenda', () => {
    for (const key of Object.values(PLAN_COUNT_LIMIT_KEY)) expect(NUMERIC_KEYS).toContain(key);
    expect(PLAN_FAIR_USE_RESOURCES).toEqual({
      free: [],
      apoiador: [],
      narrador: [],
      lenda: ['scenes', 'libraryMaps', 'sheetTemplates', 'npcSheets'],
      amigo_do_dono: [],
    });
  });
});

describe('apiErrorDto planLimit', () => {
  const REFUSAL = { code: 'PLAN_LIMIT', message: 'Your plan does not allow it' };

  it('accepts the resource, the limit and the plan of the refusal', () => {
    const planLimit = { resource: 'campaigns', limit: 1, plan: 'free' };
    expect(apiErrorDto.parse({ ...REFUSAL, planLimit }).planLimit).toEqual(planLimit);
  });

  it('refuses a resource out of the list', () => {
    const planLimit = { resource: 'tokens', limit: 1, plan: 'free' };
    expect(apiErrorDto.safeParse({ ...REFUSAL, planLimit }).success).toBe(false);
  });
});
