import { isHexColor, type PlanLimits } from '@lorkarium/contracts';
import { PlanLimitsBo } from './plan-limits.bo';

/** A color a command sends or a row holds: a palette name, a custom hex or none. */
export type SentColor = string | null | undefined;

/** The custom color (`#rrggbb`) on the table's content — drawings, effect areas, auras, bars,
 *  lights and conditions — follows the plan of the table's owner (`limits.customColor`); a name
 *  of the palette passes on every plan. Map places, document text and the cover tone have no
 *  palette, so they never come here.
 *
 *  Example: `CustomColorPlanBo.requirePaletteUnlessAllowed(shape.stroke, limits)` */
export class CustomColorPlanBo {
  /** Throws `PLAN_LIMIT` `customColor` when `color` is a hex and the plan lacks it.
   *
   *  Example: `CustomColorPlanBo.requirePaletteUnlessAllowed('#336699', PLAN_LIMITS.free) // PLAN_LIMIT` */
  static requirePaletteUnlessAllowed(color: SentColor, limits: PlanLimits): void {
    if (color === null || color === undefined || !isHexColor(color)) return;
    PlanLimitsBo.requireFeature('customColor', limits.customColor, limits);
  }

  /** An edit: every hex sent that the piece does not already hold needs the plan; keeping a hex
   *  of before passes (who went down keeps what it has).
   *
   *  Example: `CustomColorPlanBo.requirePaletteUnlessHeld(['#336699'], ['#336699'], limits) // passes` */
  static requirePaletteUnlessHeld(
    sent: readonly SentColor[],
    held: readonly SentColor[],
    limits: PlanLimits,
  ): void {
    const kept = new Set(held);
    for (const color of sent) {
      if (!kept.has(color)) CustomColorPlanBo.requirePaletteUnlessAllowed(color, limits);
    }
  }
}
