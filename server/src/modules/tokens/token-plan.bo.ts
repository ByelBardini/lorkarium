import type { PlanLimits, TokenAuraKindDto } from '@lorkarium/contracts';
import { CustomColorPlanBo, type SentColor } from '../plans/custom-color-plan.bo';
import { PlanLimitsBo } from '../plans/plan-limits.bo';

/** What a token holds that its table's plan counts: its bars, its forms, its aura's kind and the
 *  colors it wears (bars, aura, light), whose custom ones it keeps on any plan. */
export type TokenPlanHold = Readonly<{
  bars: number;
  forms: number;
  auraKind: TokenAuraKindDto | null;
  colors?: readonly SentColor[];
}>;

/** What a command sends of those; an absent one keeps what the token holds. `colors` are the
 *  ones of its bars and light (the aura's rides in `aura`). */
export type TokenPlanSent = Readonly<{
  bars?: number | undefined;
  forms?: number | undefined;
  aura?: Readonly<{ kind: TokenAuraKindDto; color?: SentColor }> | null | undefined;
  colors?: readonly SentColor[];
}>;

const NOTHING_HELD: TokenPlanHold = { bars: 0, forms: 0, auraKind: null, colors: [] };

/** The plan of the table's owner on its tokens: bars and forms per token, the kinds of aura and
 *  the sight-blocking tokens per scene. Only growth is refused: a token that already holds more
 *  (from before a lower plan) keeps it and keeps being edited. `limits` are the table's effective
 *  ones, for the other checks a token command runs (the custom color, say).
 *
 *  Example: `new TokenPlanBo(effectiveLimitsOf(scene.owner)).requireNew({ bars: 3 }) // PLAN_LIMIT` */
export class TokenPlanBo {
  constructor(readonly limits: PlanLimits) {}

  /** A token born now (created or pasted): everything it sends is new. */
  requireNew(sent: TokenPlanSent): void {
    this.requireChange(NOTHING_HELD, sent);
  }

  /** An edit of a token that holds `held`: more bars or forms than it has must fit the plan, and
   *  an aura of another kind must be one the plan has.
   *
   *  Example: `plan.requireChange({ bars: 5, forms: 0, auraKind: null }, { bars: 5 }) // passes` */
  requireChange(held: TokenPlanHold, sent: TokenPlanSent): void {
    if (sent.bars !== undefined) this.requireRoom('tokenBars', held.bars, sent.bars);
    if (sent.forms !== undefined) this.requireRoom('tokenForms', held.forms, sent.forms);
    this.requireAura(held.auraKind, sent.aura);
    this.requireColors(held.colors ?? [], [...(sent.colors ?? []), sent.aura?.color]);
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

  private requireRoom(resource: 'tokenBars' | 'tokenForms', held: number, sent: number): void {
    PlanLimitsBo.requireRoom(resource, held, sent - held, this.limits);
  }

  // No aura, taking it away or keeping the kind it already has always passes.
  private requireAura(held: TokenAuraKindDto | null, aura: TokenPlanSent['aura']): void {
    if (!aura || aura.kind === held) return;
    PlanLimitsBo.requireFeature('auraKind', this.limits.auraKinds.includes(aura.kind), this.limits);
  }
}
