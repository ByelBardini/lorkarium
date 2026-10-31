import { describe, expect, it } from 'vitest';
import {
  documentIdOf,
  documentKey,
  imageIdOf,
  imageKey,
  libraryEntries,
  sheetIdOf,
  sheetKey,
  sheetTemplateIdOf,
} from '@/lib/library-entries';
import { masterLibrary } from '../support/library-fixtures';
import { lyraSummary, spareSummary } from '../support/sheet-fixtures';

const portrait = {
  id: 'portrait',
  name: 'Retrato',
  folderId: null,
  visibility: 'public' as const,
  asset: { id: 'asset', width: 100, height: 200, mimeType: 'image/png' as const },
  updatedAt: '2026-10-29T12:00:00.000Z',
};

describe('mixed library entries', () => {
  it('documents sharing an image id keep separate identities and filter independently', () => {
    const document = {
      id: portrait.id,
      name: 'Carta',
      folderId: null,
      visibility: 'private' as const,
      version: 0,
      updatedAt: portrait.updatedAt,
      canEdit: true,
      canManage: true,
    };
    const entries = libraryEntries(
      { ...masterLibrary(), images: [portrait], documents: [document] },
      'document',
    );
    expect(entries).toEqual([{ ...document, id: 'document:portrait', kind: 'document' }]);
    expect(documentIdOf(documentKey(document.id))).toBe(document.id);
    expect(imageIdOf(documentKey(document.id))).toBeNull();
  });
  it('images and grids sharing an id keep different tree identities', () => {
    const library = masterLibrary();
    const image = { ...portrait, id: library.scenes[0]!.id };
    const entries = libraryEntries({ ...library, images: [image] });
    expect(entries.map(({ id }) => id)).toContain(imageKey(image.id));
    expect(entries.map(({ id }) => id)).toContain(image.id);
    expect(imageIdOf(imageKey(image.id))).toBe(image.id);
  });
  it('image type filter removes grids while retaining the image folder', () => {
    const image = { ...portrait, folderId: 'folder' };
    expect(libraryEntries({ ...masterLibrary(), images: [image] }, 'image')).toEqual([
      { ...image, id: 'image:portrait', kind: 'image' },
    ]);
  });
  it('a sheet key never reads as a template key, nor the other way round', () => {
    expect(sheetIdOf(sheetKey('s1'))).toBe('s1');
    expect(sheetTemplateIdOf(sheetKey('s1'))).toBeNull();
    expect(sheetIdOf('sheet-template:t1')).toBeNull();
  });
  it('the sheet filter keeps only sheets: public when the table reads them, the holder line given', () => {
    const table = lyraSummary({ visibility: 'table' });
    const nobodys = spareSummary({ visibility: 'table' });
    const library = { ...masterLibrary(), sheets: [table, nobodys, lyraSummary({ id: 'c' })] };
    const entries = libraryEntries(library, 'sheet', (sheet) => `de ${sheet.name}`);
    expect(entries.map((entry) => [entry.id, entry.visibility])).toEqual([
      [sheetKey(table.id), 'public'],
      [sheetKey(nobodys.id), 'private'],
      [sheetKey('c'), 'private'],
    ]);
    expect(entries[0]).toMatchObject({ kind: 'sheet', holderLabel: 'de Lyra de Vharn' });
  });
});
