import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSheetTemplateExport } from '@/features/sheets/use-sheet-template-export';
import { readSheetTemplateFile } from '@/lib/sheet-template-file';
import { FileDownloadFake } from '../../support/file-download-fake';
import { TORMENTA_TEMPLATE_ID } from '../../support/sheet-fixtures';
import { tormentaTemplate } from '../../support/sheet-template-fixtures';
import { SheetTemplatesApiFake } from '../../support/sheet-templates-api-fake';

const CAMPAIGN_ID = '10000000-0000-4000-8000-000000000001';

function renderExport(api = new SheetTemplatesApiFake()) {
  const fileDownload = new FileDownloadFake();
  const view = renderHook(() =>
    useSheetTemplateExport({ api, fileDownload, campaignId: CAMPAIGN_ID }),
  );
  return { api, fileDownload, view };
}

describe('exporting a sheet template', () => {
  it('reads the saved template and saves it as a .lksheet that reads back the same', async () => {
    const { api, fileDownload, view } = renderExport();
    await act(() => view.result.current.exportTemplate(TORMENTA_TEMPLATE_ID));
    const { name, html, css, js } = tormentaTemplate();
    expect(api.detailCalls).toEqual([TORMENTA_TEMPLATE_ID]);
    expect(fileDownload.saves).toHaveLength(1);
    expect(fileDownload.saves[0]).toMatchObject({
      fileName: 'Ficha Tormenta.lksheet',
      type: 'application/json',
    });
    expect(readSheetTemplateFile(fileDownload.saves[0]?.text ?? '')).toEqual({
      ok: true,
      template: { name, html, css, js },
    });
    expect(view.result.current.problem).toBeNull();
  });

  it('a template that no longer exists says so and downloads nothing', async () => {
    const api = new SheetTemplatesApiFake();
    api.detailResult = { ok: false, failure: { kind: 'not_found' } };
    const { fileDownload, view } = renderExport(api);
    await act(() => view.result.current.exportTemplate(TORMENTA_TEMPLATE_ID));
    expect(fileDownload.saves).toEqual([]);
    expect(view.result.current.problem).toBe('Este modelo não existe mais.');
  });

  it('offline says there is no connection', async () => {
    const api = new SheetTemplatesApiFake();
    api.detailResult = { ok: false, failure: { kind: 'offline' } };
    const { view } = renderExport(api);
    await act(() => view.result.current.exportTemplate(TORMENTA_TEMPLATE_ID));
    expect(view.result.current.problem).toMatch(/Sem conexão/u);
    expect(view.result.current.busy).toBe(false);
  });
});
