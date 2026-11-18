import { sheetTemplateFileKindOf, type PlanLimits } from '@lorkarium/contracts';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { FolderNotFoundError } from '../library/library.error';
import { PlanLimitsBo } from '../plans/plan-limits.bo';
import { SheetTemplateInUseError, SheetTemplateVersionConflictError } from './sheets.error';

/** What the rules read of a template: which one and the version it is at. */
export type TemplateRevision = Readonly<{ id: string; version: number }>;

/** One file of a template as the rules read it: its path and its text. */
export type TemplateFile = Readonly<{ path: string; content: string }>;

/** The rules of the sheet templates: only masters (co-masters included) write or read the code,
 *  a save names the version it read, a template in use is never deleted and a folder must be the
 *  table's.
 *
 *  Example: `new SheetTemplateBo(access).requireUnused(template, 2) // throws SHEET_TEMPLATE_IN_USE` */
export class SheetTemplateBo {
  constructor(private readonly access: CampaignAccessBo) {}

  /** The template code runs on every screen of the table: only its masters author it. */
  requireAuthor(action: string): void {
    this.access.requireMaster(action);
  }

  requireVersion(template: TemplateRevision, expectedVersion: number): void {
    if (template.version === expectedVersion) return;
    throw new SheetTemplateVersionConflictError(template.id, expectedVersion, template.version);
  }

  /** Deleting never cascades to the sheets: their values are the players'. */
  requireUnused(template: TemplateRevision, sheetCount: number): void {
    if (sheetCount === 0) return;
    throw new SheetTemplateInUseError(template.id, sheetCount);
  }

  /** A table without `sheetScripts` writes no new nor changed `.js` (PLAN_LIMIT): the ones stored
   *  and intact (same path, same text) stay, so the master still fixes the HTML and the code comes
   *  back whole if the table goes up a plan. Creating passes `[]` as `stored`.
   *
   *  Example: `rules.requireScriptsAllowed(found.files, input.files, limits)` */
  requireScriptsAllowed(
    stored: readonly TemplateFile[],
    next: readonly TemplateFile[],
    limits: PlanLimits,
  ): void {
    if (limits.sheetScripts) return;
    const intact = next.every((file) => !isScript(file) || isStoredIntact(file, stored));
    PlanLimitsBo.requireFeature('sheetScripts', intact, limits);
  }

  /** `null` is the root; any other id must be one of the table's folders. */
  requireFolder(folderIds: readonly string[], folderId: string | null): void {
    if (folderId === null || folderIds.includes(folderId)) return;
    throw new FolderNotFoundError(this.access.campaignIdOf(), folderId);
  }
}

function isScript(file: TemplateFile): boolean {
  return sheetTemplateFileKindOf(file.path) === 'js';
}

function isStoredIntact(file: TemplateFile, stored: readonly TemplateFile[]): boolean {
  return stored.some(({ path, content }) => path === file.path && content === file.content);
}
