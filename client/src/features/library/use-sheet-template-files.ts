import type { CreateSheetTemplateRequestDto } from '@lorkarium/contracts';
import {
  useSheetTemplateExport,
  type SheetTemplateExportPorts,
} from '@/features/sheets/use-sheet-template-export';
import type { FileDownload } from '@/services/file-download';
import type { SheetTemplatesApi } from '@/services/sheet-templates-api';
import { useSheetTemplateImport, type SheetTemplateImporter } from './use-sheet-template-import';

export type SheetTemplateFilesInput = Readonly<{
  campaignId: string;
  sheetTemplatesApi?: SheetTemplatesApi;
  fileDownload?: FileDownload;
  importTemplate: (template: CreateSheetTemplateRequestDto) => Promise<void>;
  refusal: string | null;
}>;

export type SheetTemplateFiles = Readonly<{
  importer: SheetTemplateImporter;
  /** Absent without the template API or the download: the editor shows no export button. */
  exportPorts: SheetTemplateExportPorts | undefined;
  exportTemplate: ((templateId: string) => void) | undefined;
  exportProblem: string | null;
}>;

/** The library's `.lksheet` actions: import into a folder and export the saved version.
 *
 *  Example: `const files = useSheetTemplateFiles({ campaignId, sheetTemplatesApi, fileDownload, importTemplate, refusal })` */
export function useSheetTemplateFiles(input: SheetTemplateFilesInput): SheetTemplateFiles {
  const { sheetTemplatesApi: api, fileDownload, campaignId } = input;
  const exportPorts = api && fileDownload ? { api, fileDownload, campaignId } : undefined;
  const exporter = useSheetTemplateExport(exportPorts);
  const importer = useSheetTemplateImport(input);
  return {
    importer,
    exportPorts,
    exportTemplate: exportPorts ? (id) => void exporter.exportTemplate(id) : undefined,
    exportProblem: exporter.problem,
  };
}
