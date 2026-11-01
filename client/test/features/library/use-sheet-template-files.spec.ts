import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  useSheetTemplateFiles,
  type SheetTemplateFilesInput,
} from '@/features/library/use-sheet-template-files';
import { VHARN } from '../../support/campaigns-api-fake';
import { FileDownloadFake } from '../../support/file-download-fake';
import { SheetTemplatesApiFake } from '../../support/sheet-templates-api-fake';

function filesOf(ports: Partial<SheetTemplateFilesInput>) {
  return renderHook(() =>
    useSheetTemplateFiles({
      campaignId: VHARN.id,
      importTemplate: () => Promise.resolve(),
      refusal: null,
      ...ports,
    }),
  ).result.current;
}

describe('useSheetTemplateFiles', () => {
  it('without the template API there is no export', () => {
    const files = filesOf({ fileDownload: new FileDownloadFake() });
    expect(files.exportPorts).toBeUndefined();
    expect(files.exportTemplate).toBeUndefined();
  });

  it('without the download there is no export', () => {
    const files = filesOf({ sheetTemplatesApi: new SheetTemplatesApiFake() });
    expect(files.exportPorts).toBeUndefined();
    expect(files.exportTemplate).toBeUndefined();
  });

  it('with both ports the export is offered for the campaign, and the import is always there', () => {
    const api = new SheetTemplatesApiFake();
    const fileDownload = new FileDownloadFake();
    const files = filesOf({ sheetTemplatesApi: api, fileDownload });
    expect(files.exportPorts).toEqual({ api, fileDownload, campaignId: VHARN.id });
    expect(files.exportTemplate).toBeTypeOf('function');
    expect(files.importer.choose).toBeTypeOf('function');
    expect(files.exportProblem).toBeNull();
  });
});
