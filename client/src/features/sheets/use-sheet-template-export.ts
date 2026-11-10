import type { SheetManifestAssetDto, SheetTemplateFileAssetDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { bytesToBase64 } from '@/lib/base64';
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
  const assets = await fileAssetsOf(ports.api, saved.value.manifest.assets);
  if (!Array.isArray(assets)) return assets;
  const text = sheetTemplateFileText({ ...saved.value, assets });
  ports.fileDownload.save(text, sheetTemplateFileName(saved.value.name), SHEET_TEMPLATE_FILE_MIME);
  return null;
}

// Every declared asset goes in the file as base64; one that cannot be read stops the export.
async function fileAssetsOf(
  api: Pick<SheetTemplatesApi, 'asset'>,
  declared: readonly SheetManifestAssetDto[],
): Promise<SheetTemplateFileAssetDto[] | SheetTemplatesFailure['kind']> {
  const assets: SheetTemplateFileAssetDto[] = [];
  for (const { path, assetId } of declared) {
    const read = await api.asset(assetId);
    if (!read.ok) return read.failure.kind;
    assets.push({
      path,
      type: read.value.type,
      data: bytesToBase64(new Uint8Array(read.value.bytes)),
    });
  }
  return assets;
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
