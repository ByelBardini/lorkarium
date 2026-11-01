import type { CreateSheetTemplateRequestDto } from '@lorkarium/contracts';
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

function renderImporter(recorder: LibraryImportRecorder) {
  const hook = renderHook(() =>
    useSheetTemplateImport({
      importTemplate: recorder.importTemplate,
      refusal: recorder.refusal,
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

  it('a file over 2 MiB is refused by size without reading it', async () => {
    const { current } = renderImporter(new LibraryImportRecorder());
    const file = new ClaimedSizeFileFake(2 * 1024 * 1024 + 1);
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
});
