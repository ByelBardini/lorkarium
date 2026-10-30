import { describe, expect, it } from 'vitest';
import {
  documentIdOf,
  documentKey,
  imageIdOf,
  imageKey,
  libraryEntries,
} from '@/lib/library-entries';
import { masterLibrary } from '../support/library-fixtures';

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
});
