import { describe, expect, it } from 'vitest';
import { FolderPrivacyBo } from '../../../src/modules/library/folder-privacy.bo';

const ATO = { id: 'ato', parentId: null, visibility: 'public' } as const;
const CATACUMBAS = { id: 'catacumbas', parentId: 'ato', visibility: 'private' } as const;
const OSSUARIO = { id: 'ossuario', parentId: 'catacumbas', visibility: 'public' } as const;

describe('FolderPrivacyBo', () => {
  const privacy = new FolderPrivacyBo([ATO, CATACUMBAS, OSSUARIO]);

  it('hides what sits directly in a private folder', () => {
    expect(privacy.hides('catacumbas')).toBe(true);
  });

  it('hides a public folder under a private one', () => {
    expect(privacy.hides('ossuario')).toBe(true);
  });

  it('does not hide a public folder above a private one', () => {
    expect(privacy.hides('ato')).toBe(false);
  });

  it('never hides what is at the root', () => {
    expect(privacy.hides(null)).toBe(false);
  });

  it('does not hide a folder it does not know', () => {
    expect(privacy.hides('de outra mesa')).toBe(false);
  });

  it('ends on a corrupt loop of folders', () => {
    const loop = [
      { id: 'a', parentId: 'b', visibility: 'public' },
      { id: 'b', parentId: 'a', visibility: 'public' },
    ] as const;
    expect(new FolderPrivacyBo(loop).hides('a')).toBe(false);
  });
});
