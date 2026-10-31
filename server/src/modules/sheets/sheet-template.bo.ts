import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { FolderNotFoundError } from '../library/library.error';
import { SheetTemplateInUseError, SheetTemplateVersionConflictError } from './sheets.error';

/** What the rules read of a template: which one and the version it is at. */
export type TemplateRevision = Readonly<{ id: string; version: number }>;

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

  /** `null` is the root; any other id must be one of the table's folders. */
  requireFolder(folderIds: readonly string[], folderId: string | null): void {
    if (folderId === null || folderIds.includes(folderId)) return;
    throw new FolderNotFoundError(this.access.campaignIdOf(), folderId);
  }
}
