import type {
  CreateSheetTemplateRequestDto,
  SheetTemplateAssetMimeTypeDto,
} from '@lorkarium/contracts';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  useSheetTemplateImport,
  type SheetTemplateImporter,
} from '@/features/library/use-sheet-template-import';
import {
  ClaimedSizeFileFake,
  lksheetFile,
  tormentaFileContent,
} from '../../support/sheet-template-file-fakes';
import { SheetTemplatesApiFake } from '../../support/sheet-templates-api-fake';
import { sheetTemplateFileText } from '@/lib/sheet-template-file';

const FOLDER_ID = '0b9c1f4e-8a7d-4c3b-9e2f-1a2b3c4d5e6f';
const REFUSAL = 'A pasta não existe mais. Recarregue a biblioteca.';

/** The library side of the import: records each create and plays the refusal it would show. */
class LibraryImportRecorder {
  readonly created: CreateSheetTemplateRequestDto[] = [];
  refusal: string | null = null;
  refusalAfterCreate: string | null = null;
  readonly importTemplate = (template: CreateSheetTemplateRequestDto): Promise<void> => {
    this.created.push(template);
    this.refusal = this.refusalAfterCreate;
    return Promise.resolve();
  };
}

function renderImporter(recorder: LibraryImportRecorder, api?: SheetTemplatesApiFake) {
  const uploadAsset = api
    ? (bytes: ArrayBuffer, type: SheetTemplateAssetMimeTypeDto) =>
        api.uploadAsset('vharn', bytes, type)
    : undefined;
  const hook = renderHook(() =>
    useSheetTemplateImport({
      importTemplate: recorder.importTemplate,
      refusal: recorder.refusal,
      uploadAsset,
    }),
  );
  const current = (): SheetTemplateImporter => hook.result.current;
  return { current, rerender: () => hook.rerender() };
}

async function pickInto(importer: () => SheetTemplateImporter, folderId: string | null) {
  act(() => importer().choose(folderId));
  await act(() => importer().readFile(lksheetFile()));
}

describe('useSheetTemplateImport', () => {
  it('choose clicks the hidden input it was attached to', () => {
    const { current } = renderImporter(new LibraryImportRecorder());
    const input = document.createElement('input');
    let clicks = 0;
    input.addEventListener('click', () => (clicks += 1));
    act(() => current().attachInput(input));
    act(() => current().choose(null));
    expect(clicks).toBe(1);
  });

  it('a good file waits for confirmation in the folder chosen, creating nothing yet', async () => {
    const recorder = new LibraryImportRecorder();
    const { current } = renderImporter(recorder);
    await pickInto(current, FOLDER_ID);
    expect(current().pending).toEqual({ folderId: FOLDER_ID, template: tormentaFileContent() });
    expect(current().problem).toBeNull();
    expect(recorder.created).toEqual([]);
  });

  it('no file picked (the picker closed) changes nothing', async () => {
    const { current } = renderImporter(new LibraryImportRecorder());
    await act(() => current().readFile(undefined));
    expect(current().pending).toBeNull();
    expect(current().problem).toBeNull();
  });

  it('a file over 12 MiB is refused by size without reading it', async () => {
    const { current } = renderImporter(new LibraryImportRecorder());
    const file = new ClaimedSizeFileFake(12 * 1024 * 1024 + 1);
    await act(() => current().readFile(file));
    expect(file.textReads).toBe(0);
    expect(current().problem).toMatch(/passa de 512 KiB/u);
    expect(current().pending).toBeNull();
  });

  it('a good file after a refused one clears the refusal', async () => {
    const { current } = renderImporter(new LibraryImportRecorder());
    await act(() => current().readFile(lksheetFile('nope')));
    expect(current().problem).not.toBeNull();
    await pickInto(current, null);
    expect(current().problem).toBeNull();
  });

  it('confirm creates the file’s code with the name given, in the folder chosen', async () => {
    const recorder = new LibraryImportRecorder();
    const { current, rerender } = renderImporter(recorder);
    await pickInto(current, FOLDER_ID);
    await act(() => current().confirm('Tormenta (cópia)'));
    rerender();
    expect(recorder.created).toEqual([
      { ...tormentaFileContent(), name: 'Tormenta (cópia)', folderId: FOLDER_ID },
    ]);
    expect(current().pending).toBeNull();
    expect(current().sendError).toBeNull();
  });

  it('a create the library refuses keeps the file pending and says why', async () => {
    const recorder = new LibraryImportRecorder();
    recorder.refusalAfterCreate = REFUSAL;
    const { current, rerender } = renderImporter(recorder);
    await pickInto(current, null);
    await act(() => current().confirm('Ficha Tormenta'));
    rerender();
    expect(current().sendError).toBe(REFUSAL);
    expect(current().pending?.template).toEqual(tormentaFileContent());
  });

  it('a refusal already on screen before confirming is not the import’s', async () => {
    const recorder = new LibraryImportRecorder();
    recorder.refusal = 'Este modelo não existe mais.';
    const { current } = renderImporter(recorder);
    await pickInto(current, null);
    expect(current().sendError).toBeNull();
    expect(current().pending).not.toBeNull();
  });

  it('after a finished import, a later refusal does not bring the file back', async () => {
    const recorder = new LibraryImportRecorder();
    const { current, rerender } = renderImporter(recorder);
    await pickInto(current, null);
    await act(() => current().confirm('Ficha Tormenta'));
    rerender();
    recorder.refusal = 'Este modelo está ligado a fichas.';
    rerender();
    expect(current().pending).toBeNull();
    expect(current().sendError).toBeNull();
  });

  it('cancel drops the pending file', async () => {
    const recorder = new LibraryImportRecorder();
    const { current } = renderImporter(recorder);
    await pickInto(current, null);
    act(() => current().cancel());
    expect(current().pending).toBeNull();
    expect(recorder.created).toEqual([]);
  });

  describe('a file that carries assets', () => {
    const font = { path: 'fontes/x.woff2', type: 'font/woff2' as const, data: 'd09GMg==' };
    const withFont = () =>
      lksheetFile(sheetTemplateFileText({ ...tormentaFileContent(), assets: [font] }));

    it('sends each asset to this table first, then creates the template naming the new ids', async () => {
      const recorder = new LibraryImportRecorder();
      const api = new SheetTemplatesApiFake();
      const { current } = renderImporter(recorder, api);
      await act(() => current().readFile(withFont()));
      await act(() => current().confirm('Ficha de Lork'));

      expect(api.uploads.map(({ type, bytes }) => [type, [...new Uint8Array(bytes)]])).toEqual([
        ['font/woff2', [0x77, 0x4f, 0x46, 0x32]],
      ]);
      const [created] = recorder.created;
      expect(created?.manifest?.assets).toEqual([
        { path: 'fontes/x.woff2', assetId: expect.any(String) },
      ]);
      expect(created).not.toHaveProperty('assets');
    });

    it('an asset the table refuses creates nothing and says why, the dialog still open', async () => {
      const recorder = new LibraryImportRecorder();
      const api = new SheetTemplatesApiFake();
      api.assetAnswer = { ok: false, failure: { kind: 'unsupported_asset' } };
      const { current } = renderImporter(recorder, api);
      await act(() => current().readFile(withFont()));
      await act(() => current().confirm('Ficha de Lork'));

      expect(recorder.created).toEqual([]);
      expect(current().sendError).toBe(
        'O arquivo não é uma imagem PNG, JPEG ou WebP nem uma fonte WOFF2.',
      );
      expect(current().pending).not.toBeNull();
    });
  });
});
