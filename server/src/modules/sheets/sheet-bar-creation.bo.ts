import type { PlanLimits } from '@lorkarium/contracts';
import { barLabelKey } from '@lorkarium/game-core';
import { PlanLimitsBo } from '../plans/plan-limits.bo';
import { SheetBarLimitError, SheetPermissionNotDeclaredError } from './sheets.error';

/** The permission a template declares so its sheets may create bars on their holder. */
export const SHEET_BAR_CREATION_PERMISSION = 'character:bars';

type LabelledBar = Readonly<{ id: string; label: string }>;

/** The rule of a sheet creating a bar on its holder: the template must declare
 *  `character:bars` (the master approved it on import; a player never creates a bar by hand),
 *  and the bar either is there under its label or fits under the bar cap of the table's plan
 *  (`limits`, its owner's effective ones).
 *
 *  Example: `new SheetBarCreationBo(sheetId, effectiveLimitsOf(campaign.owner)).requireDeclared(manifest.permissions)` */
export class SheetBarCreationBo {
  constructor(
    private readonly sheetId: string,
    private readonly limits: PlanLimits,
  ) {}

  /** The bars a holder keeps at most on this table: the plan's (the technical cap at most). */
  get barCap(): number {
    return this.limits.maxBarsPerToken;
  }

  /** PERMISSION_NOT_DECLARED unless the manifest lists `character:bars`.
   *
   *  Example: `rules.requireDeclared(['character:stats']) // throws PERMISSION_NOT_DECLARED` */
  requireDeclared(permissions: readonly string[]): void {
    if (permissions.includes(SHEET_BAR_CREATION_PERMISSION)) return;
    throw new SheetPermissionNotDeclaredError(this.sheetId, SHEET_BAR_CREATION_PERMISSION);
  }

  /** The id of the holder's bar under `label` (no case, accents or edge spaces); a label the
   *  writes skipped for the cap is PLAN_LIMIT `tokenBars` under a plan below the technical cap,
   *  BAR_LIMIT at it.
   *
   *  Example: `rules.barIdOf('Fôlego', bars, []) // the id of the "folego" bar` */
  barIdOf(label: string, bars: readonly LabelledBar[], skipped: readonly string[]): string {
    if (skipped.length > 0) {
      PlanLimitsBo.requireRoom('tokenBars', bars.length, 1, this.limits);
      throw new SheetBarLimitError(label, this.barCap);
    }
    const key = barLabelKey(label);
    const found = bars.find((bar) => barLabelKey(bar.label) === key);
    if (found) return found.id;
    throw new Error(
      `Bar "${label}" is missing on the holder of sheet ${this.sheetId} after its write`,
    );
  }
}
