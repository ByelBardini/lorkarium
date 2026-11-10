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
    const { name, files, manifest } = tormentaTemplate();
    expect(api.detailCalls).toEqual([TORMENTA_TEMPLATE_ID]);
    expect(fileDownload.saves).toHaveLength(1);
    expect(fileDownload.saves[0]).toMatchObject({
      fileName: 'Ficha Tormenta.lksheet',
      type: 'application/json',
    });
    expect(readSheetTemplateFile(fileDownload.saves[0]?.text ?? '')).toEqual({
      ok: true,
      template: { name, files, manifest },
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

  it('puts the bytes of each declared asset in the file, and a missing one stops the export', async () => {
    const api = new SheetTemplatesApiFake();
    const sent = await api.uploadAsset(
      CAMPAIGN_ID,
      new Uint8Array([0x77, 0x4f, 0x46, 0x32]).buffer,
      'font/woff2',
    );
    const assetId = sent.ok ? sent.value.id : '';
    const manifest = { permissions: [], bars: [], assets: [{ path: 'fontes/x.woff2', assetId }] };
    api.templates.set(TORMENTA_TEMPLATE_ID, tormentaTemplate({ manifest }));
    const { fileDownload, view } = renderExport(api);
    await act(() => view.result.current.exportTemplate(TORMENTA_TEMPLATE_ID));
    const reading = readSheetTemplateFile(fileDownload.saves[0]?.text ?? '');
    expect(reading.ok && reading.template.assets).toEqual([
      { path: 'fontes/x.woff2', type: 'font/woff2', data: 'd09GMg==' },
    ]);

    api.assetFiles.clear();
    await act(() => view.result.current.exportTemplate(TORMENTA_TEMPLATE_ID));
    expect(fileDownload.saves).toHaveLength(1);
    expect(view.result.current.problem).toBe('Este modelo não existe mais.');
  });
});
