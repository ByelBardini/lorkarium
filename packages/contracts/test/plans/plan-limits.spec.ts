import { describe, expect, it } from 'vitest';
import { ASSET_MAX_SIDE } from '../../src/assets/asset.dto';
import { LIGHTS_PER_SCENE_MAX } from '../../src/board/light.dto';
import { SAVED_TOKEN_FOLDERS_MAX, SAVED_TOKENS_MAX } from '../../src/board/saved-token.dto';
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
  PERSONAL_SAVED_ROLL_LIMITS,
  PERSONAL_SAVED_TOKEN_LIMITS,
  PLAN_LIMITS,
  planLimitsDto,
  savedRollLimitsOf,
  savedTokenLimitsOf,
  type PlanLimits,
} from '../../src/plans/plan-limits';
import {
  PLAN_FEATURE_RESOURCES,
  USER_PLANS,
  planLimitResourceDto,
  userPlanDto,
} from '../../src/plans/user-plan.dto';

type NumericKey = {
  [K in keyof PlanLimits]: PlanLimits[K] extends number | null ? K : never;
}[keyof PlanLimits];

const NUMERIC_KEYS = Object.keys(PLAN_LIMITS.free).filter(
  (key) => typeof PLAN_LIMITS.free[key as keyof PlanLimits] === 'number',
) as NumericKey[];

const MEBIBYTE = 1024 * 1024;
const GIBIBYTE = 1024 * MEBIBYTE;

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

  it('every numeric ceiling grows strictly from Grátis to Narrador', () => {
    const flat = NUMERIC_KEYS.filter(
      (key) => (PLAN_LIMITS.free[key] as number) >= (PLAN_LIMITS.narrador[key] as number),
    );
    expect(flat).toEqual([]);
  });

  it('every numeric ceiling grows strictly from Narrador to Lenda, except the image sides', () => {
    const flat = NUMERIC_KEYS.filter(
      (key) => (PLAN_LIMITS.narrador[key] as number) >= (PLAN_LIMITS.lenda[key] as number),
    );
    expect(flat).toEqual(['maxMapSide', 'maxBackgroundSide']);
  });

  it('Grátis is cut on scale: 3 grids, no interactive map, 1 bar, 5 seats', () => {
    expect(PLAN_LIMITS.free).toMatchObject({
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
      maxSavedRolls: 3,
      maxDiceModelsPerRoll: 8,
    });
  });

  it('Narrador is the middle step: 3 tables, 1 GiB, 10 tabs, 4 bars', () => {
    expect(PLAN_LIMITS.narrador).toMatchObject({
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
      maxDiceModelsPerRoll: 15,
    });
  });

  it('Lenda keeps 10 tables on 5 GiB', () => {
    expect(PLAN_LIMITS.lenda).toMatchObject({ maxCampaigns: 10, maxStorageBytes: 5 * GIBIBYTE });
  });

  it('desktop windows, effect and image auras and animated table art are Lenda only', () => {
    const lendaUp = ['lenda', 'amigo_do_dono'];
    expect(USER_PLANS.filter((plan) => PLAN_LIMITS[plan].desktopWindows)).toEqual(lendaUp);
    expect(USER_PLANS.filter((plan) => PLAN_LIMITS[plan].animatedCampaignArt)).toEqual(lendaUp);
    expect(USER_PLANS.filter((plan) => PLAN_LIMITS[plan].profileBanner)).toEqual(lendaUp);
    expect(USER_PLANS.filter((plan) => PLAN_LIMITS[plan].auraKinds.includes('image'))).toEqual(
      lendaUp,
    );
    expect(PLAN_LIMITS.narrador.auraKinds).toEqual(['color']);
  });

  it('magic sight opens from Narrador up, and is a feature a refusal may name', () => {
    const open = USER_PLANS.filter((plan) => PLAN_LIMITS[plan].magicSight);
    expect(open).toEqual(['narrador', 'lenda', 'amigo_do_dono']);
    expect(planLimitResourceDto.parse('magicSight')).toBe('magicSight');
    expect(PLAN_FEATURE_RESOURCES).toContain('magicSight');
  });

  it('the scripts of a sheet template open from Narrador up', () => {
    const open = USER_PLANS.filter((plan) => PLAN_LIMITS[plan].sheetScripts);
    expect(open).toEqual(['narrador', 'lenda', 'amigo_do_dono']);
  });

  it('refuses a grid without sheetScripts, naming the key', () => {
    const withoutScripts = Object.fromEntries(
      Object.entries(PLAN_LIMITS.narrador).filter(([key]) => key !== 'sheetScripts'),
    );
    const result = planLimitsDto.safeParse(withoutScripts);
    expect(result.error?.issues[0]?.path).toEqual(['sheetScripts']);
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
      maxSavedTokens: SAVED_TOKENS_MAX,
      maxSavedTokenFolders: SAVED_TOKEN_FOLDERS_MAX,
      maxDiceModelsPerRoll: DICE_THROW_MODELS_MAX,
      maxMapSide: ASSET_MAX_SIDE.library_map,
      maxBackgroundSide: ASSET_MAX_SIDE.background,
      auraKinds: ['color', 'effect', 'image'],
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
    } satisfies PlanLimits);
  });

  it('Apoiador has the table limits of Grátis under its own name: only the account opens', () => {
    expect(PLAN_LIMITS.apoiador).toEqual({
      ...PLAN_LIMITS.free,
      plan: 'apoiador',
      maxCustomEmojis: 10,
    });
    expect(PLAN_LIMITS.apoiador.customColor).toBe(false);
  });

  it('custom emojis: 10 on Apoiador, 25 on Narrador, 50 on Lenda, none on Grátis', () => {
    expect(USER_PLANS.map((plan) => PLAN_LIMITS[plan].maxCustomEmojis)).toEqual([
      0,
      10,
      25,
      50,
      null,
    ]);
    expect(PLAN_COUNT_LIMIT_KEY.customEmojis).toBe('maxCustomEmojis');
  });

  it('an animated custom emoji is Lenda only', () => {
    const animated = USER_PLANS.filter((plan) => PLAN_LIMITS[plan].animatedCustomEmojis);
    expect(animated).toEqual(['lenda', 'amigo_do_dono']);
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
      campaignArt: false,
      animatedCampaignArt: false,
      privateCampaign: false,
      sheetScripts: false,
      profileBanner: false,
      magicSight: false,
    });
  });

  it('own cover and banner and the private table open from Narrador up', () => {
    const open = USER_PLANS.filter((plan) => PLAN_LIMITS[plan].campaignArt);
    const privateOpen = USER_PLANS.filter((plan) => PLAN_LIMITS[plan].privateCampaign);
    expect(open).toEqual(['narrador', 'lenda', 'amigo_do_dono']);
    expect(privateOpen).toEqual(['narrador', 'lenda', 'amigo_do_dono']);
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

  it('accepts a refusal for an item kept read only past the plan', () => {
    const planLimit = { resource: 'scenes', limit: 3, plan: 'free', reason: 'readOnly' };
    expect(apiErrorDto.parse({ ...REFUSAL, planLimit }).planLimit?.reason).toBe('readOnly');
  });

  it('refuses a reason out of room and readOnly', () => {
    const planLimit = { resource: 'scenes', limit: 3, plan: 'free', reason: 'other' };
    expect(apiErrorDto.safeParse({ ...REFUSAL, planLimit }).success).toBe(false);
  });

  it('accepts who gave the ceiling: the account or the table', () => {
    const planLimit = { resource: 'savedRolls', limit: 15, plan: 'apoiador', holder: 'account' };
    expect(apiErrorDto.parse({ ...REFUSAL, planLimit }).planLimit?.holder).toBe('account');
  });

  it('refuses a holder out of account and table, citing the value', () => {
    const planLimit = { resource: 'savedRolls', limit: 15, plan: 'apoiador', holder: 'team' };
    const result = apiErrorDto.safeParse({ ...REFUSAL, planLimit });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('team');
  });

  it('refuses a resource out of the list', () => {
    const planLimit = { resource: 'tokens', limit: 1, plan: 'free' };
    expect(apiErrorDto.safeParse({ ...REFUSAL, planLimit }).success).toBe(false);
  });
});

describe('PERSONAL_SAVED_ROLL_LIMITS', () => {
  it('gives the Apoiador the saved rolls and folders of the Narrador', () => {
    expect(PERSONAL_SAVED_ROLL_LIMITS.apoiador).toEqual({
      maxSavedRolls: 15,
      maxSavedRollFolders: 5,
    });
  });

  it('gives every other plan the ceilings of its own grid', () => {
    expect(PERSONAL_SAVED_ROLL_LIMITS.free).toEqual({ maxSavedRolls: 3, maxSavedRollFolders: 0 });
    expect(PERSONAL_SAVED_ROLL_LIMITS.narrador).toEqual({
      maxSavedRolls: 15,
      maxSavedRollFolders: 5,
    });
    expect(PERSONAL_SAVED_ROLL_LIMITS.lenda).toEqual({
      maxSavedRolls: 50,
      maxSavedRollFolders: 50,
    });
    expect(PERSONAL_SAVED_ROLL_LIMITS.amigo_do_dono).toEqual({
      maxSavedRolls: 50,
      maxSavedRollFolders: 50,
    });
  });
});

describe('saved tokens in the grid', () => {
  it('a table gives 0 saved tokens on Grátis and Apoiador, 20 on Narrador, 50 on Lenda', () => {
    expect(USER_PLANS.map((plan) => PLAN_LIMITS[plan].maxSavedTokens)).toEqual([0, 0, 20, 50, 50]);
    expect(PLAN_LIMITS.amigo_do_dono.maxSavedTokens).toBe(SAVED_TOKENS_MAX);
  });

  it('a table gives 0 folders on Grátis and Apoiador, 5 on Narrador, 20 on Lenda', () => {
    expect(USER_PLANS.map((plan) => PLAN_LIMITS[plan].maxSavedTokenFolders)).toEqual([
      0, 0, 5, 20, 20,
    ]);
    expect(PLAN_LIMITS.amigo_do_dono.maxSavedTokenFolders).toBe(SAVED_TOKEN_FOLDERS_MAX);
  });

  it('a refusal may name savedTokens and savedTokenFolders', () => {
    expect(PLAN_COUNT_LIMIT_KEY.savedTokens).toBe('maxSavedTokens');
    expect(PLAN_COUNT_LIMIT_KEY.savedTokenFolders).toBe('maxSavedTokenFolders');
    expect(planLimitResourceDto.parse('savedTokens')).toBe('savedTokens');
  });

  it('the person: Grátis 0/0, Apoiador 5/2, Narrador 20/5, Lenda 50/20', () => {
    expect(PERSONAL_SAVED_TOKEN_LIMITS).toEqual({
      free: { maxSavedTokens: 0, maxSavedTokenFolders: 0 },
      apoiador: { maxSavedTokens: 5, maxSavedTokenFolders: 2 },
      narrador: { maxSavedTokens: 20, maxSavedTokenFolders: 5 },
      lenda: { maxSavedTokens: 50, maxSavedTokenFolders: 20 },
      amigo_do_dono: { maxSavedTokens: 50, maxSavedTokenFolders: 20 },
    });
  });
});

describe('savedTokenLimitsOf', () => {
  it('an Apoiador at a Grátis table keeps 5 tokens and 2 folders, from its own plan', () => {
    const { limits, holder } = savedTokenLimitsOf(PLAN_LIMITS.free, 'apoiador');
    expect(limits).toMatchObject({ maxSavedTokens: 5, maxSavedTokenFolders: 2, plan: 'apoiador' });
    expect(holder).toBe('account');
  });

  it('a Grátis member at a Narrador table keeps the 20 tokens of the table', () => {
    const { limits, holder } = savedTokenLimitsOf(PLAN_LIMITS.narrador, 'free');
    expect(limits).toMatchObject({ maxSavedTokens: 20, maxSavedTokenFolders: 5, plan: 'narrador' });
    expect(holder).toBe('table');
  });

  it('a Narrador at a Narrador table ties, and the tie stays with the table', () => {
    expect(savedTokenLimitsOf(PLAN_LIMITS.narrador, 'narrador').holder).toBe('table');
  });

  it('the person winning on tokens leaves the saved rolls of the table alone', () => {
    const { limits } = savedTokenLimitsOf(PLAN_LIMITS.free, 'lenda');
    expect(limits).toMatchObject({ maxSavedTokens: 50, maxSavedRolls: 3, maxScenes: 3 });
  });
});

describe('savedRollLimitsOf', () => {
  it('the person winning on rolls leaves the saved tokens of the table alone', () => {
    const { limits } = savedRollLimitsOf(PLAN_LIMITS.free, 'apoiador');
    expect(limits).toMatchObject({ maxSavedRolls: 15, maxSavedTokens: 0 });
  });

  it('an Apoiador at a Grátis table keeps 15 rolls and 5 folders, from its own plan', () => {
    const { limits, holder } = savedRollLimitsOf(PLAN_LIMITS.free, 'apoiador');
    expect(limits).toMatchObject({ maxSavedRolls: 15, maxSavedRollFolders: 5, plan: 'apoiador' });
    expect(holder).toBe('account');
  });

  it('a Grátis member at the table of an Apoiador keeps the 3 rolls and no folder of the table', () => {
    const { limits, holder } = savedRollLimitsOf(PLAN_LIMITS.apoiador, 'free');
    expect(limits).toMatchObject({ maxSavedRolls: 3, maxSavedRollFolders: 0, plan: 'apoiador' });
    expect(holder).toBe('table');
  });

  it('a tie stays with the table', () => {
    const { limits, holder } = savedRollLimitsOf(PLAN_LIMITS.narrador, 'apoiador');
    expect(limits).toMatchObject({ maxSavedRolls: 15, maxSavedRollFolders: 5, plan: 'narrador' });
    expect(holder).toBe('table');
  });

  it('a bigger table wins over the person', () => {
    const { limits, holder } = savedRollLimitsOf(PLAN_LIMITS.lenda, 'apoiador');
    expect(limits).toMatchObject({ maxSavedRolls: 50, maxSavedRollFolders: 50, plan: 'lenda' });
    expect(holder).toBe('table');
  });

  it('a Lenda at a Grátis table keeps 50, and every other key stays the table one', () => {
    const { limits, holder } = savedRollLimitsOf(PLAN_LIMITS.free, 'lenda');
    expect(limits).toMatchObject({ maxSavedRolls: 50, maxSavedRollFolders: 50, plan: 'lenda' });
    expect(limits.maxScenes).toBe(3);
    expect(holder).toBe('account');
  });
});
