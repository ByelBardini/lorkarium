import type { GuideData } from '@/lib/guide-schema';
import type { GuideEntry } from '@/lib/guides';

/**
 * A guide entry with valid frontmatter, for specs that need one without the real collection.
 * Example: `guideEntry('recursos/dados-3d', { name: 'Dados 3D' })`
 */
export function guideEntry(id: string, overrides: Partial<GuideData> = {}): GuideEntry {
  return {
    id,
    data: {
      kind: 'recurso',
      name: 'Dados 3D',
      title: 'Dados 3D online na mesa virtual · Lorkarium',
      description:
        'Como rolar dados 3D no Lorkarium: física no servidor, rolagem secreta do mestre, bandeja e as rolagens salvas da mesa.',
      h1: 'Dados 3D online',
      lead: 'Os dados caem na mesa de todo mundo.',
      updatedAt: '2026-11-20',
      draft: false,
      order: 1,
      related: [],
      ...overrides,
    },
  };
}
