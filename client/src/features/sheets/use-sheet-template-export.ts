import { useState } from 'react';
import { sheetTemplateFileName, sheetTemplateFileText } from '@/lib/sheet-template-file';
import type { FileDownload } from '@/services/file-download';
import type { SheetTemplatesApi, SheetTemplatesFailure } from '@/services/sheet-templates-api';
import { sheetTemplateFailureMessage } from './sheet-template-messages';

const SHEET_TEMPLATE_FILE_MIME = 'application/json';

export type SheetTemplateExportPorts = Readonly<{
  api: SheetTemplatesApi;
  fileDownload: FileDownload;
  campaignId: string;
}>;

export type SheetTemplateExport = Readonly<{
  exportTemplate: (templateId: string) => Promise<void>;
  busy: boolean;
  /** Why the last export failed, in words; `null` after a download. */
  problem: string | null;
}>;

/** Reads the saved template from the server and saves it as a `.lksheet`: never the unsaved
 *  draft, so the tree and the editor always hand out the same file.
 *
 *  Example: `const failure = await exportSheetTemplate(ports, templateId); if (failure) show(failure)` */
export async function exportSheetTemplate(
  ports: SheetTemplateExportPorts,
  templateId: string,
): Promise<SheetTemplatesFailure['kind'] | null> {
  const saved = await ports.api.detail(ports.campaignId, templateId);
  if (!saved.ok) return saved.failure.kind;
  const fileName = sheetTemplateFileName(saved.value.name);
  ports.fileDownload.save(sheetTemplateFileText(saved.value), fileName, SHEET_TEMPLATE_FILE_MIME);
  return null;
}

/** The export action of the template menu and the editor, with its busy flag and failure;
 *  without ports (no template API or download here) it does nothing.
 *
 *  Example: `const exporter = useSheetTemplateExport({ api, fileDownload, campaignId }); void exporter.exportTemplate(id)` */
export function useSheetTemplateExport(
  ports: SheetTemplateExportPorts | undefined,
): SheetTemplateExport {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const exportTemplate = async (templateId: string): Promise<void> => {
    if (!ports) return;
    setBusy(true);
    const failure = await exportSheetTemplate(ports, templateId);
    setProblem(failure ? sheetTemplateFailureMessage(failure) : null);
    setBusy(false);
  };
  return { exportTemplate, busy, problem };
}
