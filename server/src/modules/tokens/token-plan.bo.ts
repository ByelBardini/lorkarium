import type { PlanLimits, TokenAuraKindDto } from '@lorkarium/contracts';
import { CustomColorPlanBo, type SentColor } from '../plans/custom-color-plan.bo';
import { PlanLimitsBo } from '../plans/plan-limits.bo';

/** The settings of a bar that go read only past the plan (its value is play and stays free). */
export type TokenBarSetting = Readonly<{ label: string; max: number; color: string }>;

/** The settings of a form that go read only past the plan; switching to it stays free. */
export type TokenFormSetting = Readonly<{ id: string; name: string; imageAssetId: string | null }>;

/** What a token holds that its table's plan counts: its bars, its forms, its aura's kind and the
 *  colors it wears (bars, aura, light), whose custom ones it keeps on any plan. The settings of
 *  its bars and forms, in position order, say which ones are read only past the plan. */
export type TokenPlanHold = Readonly<{
  bars: number;
  forms: number;
  auraKind: TokenAuraKindDto | null;
  colors?: readonly SentColor[];
  barSettings?: readonly TokenBarSetting[];
  formSettings?: readonly TokenFormSetting[];
  /** Whether it already sees the invisible (kept past the plan). */
  magicSight?: boolean;
}>;

/** What a command sends of those; an absent one keeps what the token holds. `colors` are the
 *  ones of its bars and light (the aura's rides in `aura`). */
export type TokenPlanSent = Readonly<{
  bars?: number | undefined;
  forms?: number | undefined;
  aura?: Readonly<{ kind: TokenAuraKindDto; color?: SentColor }> | null | undefined;
  colors?: readonly SentColor[];
  barSettings?: readonly TokenBarSetting[] | undefined;
  formSettings?: readonly TokenFormSetting[] | undefined;
  magicSight?: number | null | undefined;
}>;

const NOTHING_HELD: TokenPlanHold = { bars: 0, forms: 0, auraKind: null, colors: [] };

/** The plan of the table's owner on its tokens: bars and forms per token, the kinds of aura and
 *  the sight-blocking tokens per scene. Growth is refused; a token that already holds more (from
 *  before a lower plan) keeps it, and the bars and forms past the ceiling keep their settings
 *  (read only) while their values, the switch of form and the rest of the token stay free.
 *  `limits` are the table's effective ones, for the other checks a token command runs.
 *
 *  Example: `new TokenPlanBo(effectiveLimitsOf(scene.owner)).requireNew({ bars: 3 }) // PLAN_LIMIT` */
export class TokenPlanBo {
  constructor(readonly limits: PlanLimits) {}

  /** A token born now (created or pasted): everything it sends is new. */
  requireNew(sent: TokenPlanSent): void {
    this.requireChange(NOTHING_HELD, sent);
  }

  /** An edit of a token that holds `held`: more bars or forms than it has must fit the plan, an
   *  aura of another kind must be one the plan has, and the bars and forms past the plan keep
   *  their settings (read only; deleting them passes).
   *
   *  Example: `plan.requireChange({ bars: 5, forms: 0, auraKind: null }, { bars: 5 }) // passes` */
  requireChange(held: TokenPlanHold, sent: TokenPlanSent): void {
    if (sent.bars !== undefined) this.requireRoom('tokenBars', held.bars, sent.bars);
    if (sent.forms !== undefined) this.requireFormRoom(held, sent.formSettings, sent.forms);
    this.requireBarsKept(held.barSettings ?? [], sent.barSettings);
    this.requireFormsKept(held.formSettings ?? [], sent.formSettings);
    this.requireAura(held.auraKind, sent.aura);
    this.requireColors(held.colors ?? [], [...(sent.colors ?? []), sent.aura?.color]);
    this.requireMagicSight(held.magicSight ?? false, sent.magicSight);
  }

  /** Each custom color sent that the token does not already wear needs `customColor` in the
   *  plan; a palette name, or a hex it had from before, passes.
   *
   *  Example: `plan.requireColors(['#336699'], ['#336699', 'gold']) // passes on free` */
  requireColors(held: readonly SentColor[], sent: readonly SentColor[]): void {
    CustomColorPlanBo.requirePaletteUnlessHeld(sent, held, this.limits);
  }

  /** A restyle of several tokens at once: each must take the aura sent, its kind and its color.
   *
   *  Example: `plan.requireAuraOnEach([{ auraKind: null }], { kind: 'effect' }) // PLAN_LIMIT on free` */
  requireAuraOnEach(
    held: readonly Pick<TokenPlanHold, 'auraKind' | 'colors'>[],
    aura: TokenPlanSent['aura'],
  ): void {
    for (const token of held) {
      this.requireAura(token.auraKind, aura);
      this.requireColors(token.colors ?? [], [aura?.color]);
    }
  }

  /** `adding` more sight-blocking tokens on a scene that has `stored`.
   *
   *  Example: `plan.requireBlockers(await daos.tokens.countBlockersOfScene(scene.id), 1)` */
  requireBlockers(stored: number, adding: number): void {
    PlanLimitsBo.requireRoom('sightBlockers', stored, adding, this.limits);
  }

  // Bars have no id: their rank is their position. Past the ceiling, the sent bars must be the
  // held ones past it, in order, with their settings (some may be gone); a deletion before them
  // moves the first one under the ceiling, where it is free.
  private requireBarsKept(
    held: readonly TokenBarSetting[],
    sent: readonly TokenBarSetting[] | undefined,
  ): void {
    const ceiling = this.limits.maxBarsPerToken;
    const locked = held.slice(ceiling);
    if (!sent || locked.length === 0) return;
    let next = 0;
    sent.slice(ceiling).forEach((bar, index) => {
      const found = locked.findIndex((kept, at) => at >= next && sameBarSetting(kept, bar));
      if (found === -1) PlanLimitsBo.requireEditable('tokenBars', ceiling + index, this.limits);
      else next = found + 1;
    });
  }

  // Forms keep their id: each held one past the ceiling (by position) keeps its name and image.
  private requireFormsKept(
    held: readonly TokenFormSetting[],
    sent: readonly TokenFormSetting[] | undefined,
  ): void {
    const heldById = new Map(held.map((form, rank) => [form.id, { form, rank }]));
    for (const form of sent ?? []) {
      const kept = heldById.get(form.id);
      if (!kept || sameFormSetting(kept.form, form)) continue;
      PlanLimitsBo.requireEditable('tokenForms', kept.rank, this.limits);
    }
  }

  // Forms with an id the token does not hold are new: they need room next to the ones it keeps,
  // so a form past the plan is not swapped for a "new" one with its settings changed.
  private requireFormRoom(
    held: TokenPlanHold,
    sent: readonly TokenFormSetting[] | undefined,
    count: number,
  ): void {
    if (!held.formSettings || !sent) return this.requireRoom('tokenForms', held.forms, count);
    const heldIds = new Set(held.formSettings.map(({ id }) => id));
    const kept = sent.filter(({ id }) => heldIds.has(id)).length;
    PlanLimitsBo.requireRoom('tokenForms', kept, sent.length - kept, this.limits);
  }

  private requireRoom(resource: 'tokenBars' | 'tokenForms', held: number, sent: number): void {
    PlanLimitsBo.requireRoom(resource, held, sent - held, this.limits);
  }

  // Turning it off always passes; a token that already sees the invisible keeps it (and its
  // range) after the plan went down.
  private requireMagicSight(held: boolean, sent: number | null | undefined): void {
    if (sent === null || sent === undefined || held) return;
    PlanLimitsBo.requireFeature('magicSight', this.limits.magicSight, this.limits);
  }

  // No aura, taking it away or keeping the kind it already has always passes.
  private requireAura(held: TokenAuraKindDto | null, aura: TokenPlanSent['aura']): void {
    if (!aura || aura.kind === held) return;
    PlanLimitsBo.requireFeature('auraKind', this.limits.auraKinds.includes(aura.kind), this.limits);
  }
}

function sameBarSetting(left: TokenBarSetting, right: TokenBarSetting): boolean {
  return left.label === right.label && left.max === right.max && left.color === right.color;
}

function sameFormSetting(left: TokenFormSetting, right: TokenFormSetting): boolean {
  return left.name === right.name && left.imageAssetId === right.imageAssetId;
}
