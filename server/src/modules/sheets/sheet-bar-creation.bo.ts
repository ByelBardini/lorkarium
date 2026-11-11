import { barLabelKey } from '@lorkarium/game-core';
import { SheetBarLimitError, SheetPermissionNotDeclaredError } from './sheets.error';

/** The permission a template declares so its sheets may create bars on their holder. */
export const SHEET_BAR_CREATION_PERMISSION = 'character:bars';

type LabelledBar = Readonly<{ id: string; label: string }>;

/** The rule of a sheet creating a bar on its holder: the template must declare
 *  `character:bars` (the master approved it on import; a player never creates a bar by hand),
 *  and the bar either is there under its label or fits under the bar cap.
 *
 *  Example: `new SheetBarCreationBo(sheetId, MAX_BARS_PER_TOKEN).requireDeclared(manifest.permissions)` */
export class SheetBarCreationBo {
  constructor(
    private readonly sheetId: string,
    private readonly barCap: number,
  ) {}

  /** PERMISSION_NOT_DECLARED unless the manifest lists `character:bars`.
   *
   *  Example: `rules.requireDeclared(['character:stats']) // throws PERMISSION_NOT_DECLARED` */
  requireDeclared(permissions: readonly string[]): void {
    if (permissions.includes(SHEET_BAR_CREATION_PERMISSION)) return;
    throw new SheetPermissionNotDeclaredError(this.sheetId, SHEET_BAR_CREATION_PERMISSION);
  }

  /** The id of the holder's bar under `label` (no case, accents or edge spaces); a label the
   *  writes skipped for the cap is BAR_LIMIT.
   *
   *  Example: `rules.barIdOf('Fôlego', bars, []) // the id of the "folego" bar` */
  barIdOf(label: string, bars: readonly LabelledBar[], skipped: readonly string[]): string {
    if (skipped.length > 0) throw new SheetBarLimitError(label, this.barCap);
    const key = barLabelKey(label);
    const found = bars.find((bar) => barLabelKey(bar.label) === key);
    if (found) return found.id;
    throw new Error(
      `Bar "${label}" is missing on the holder of sheet ${this.sheetId} after its write`,
    );
  }
}
