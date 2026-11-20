import { describe, expect, it } from 'vitest';
import {
  contentPageOf,
  hiddenPathsOf,
  isIndexablePath,
  isoDateOf,
  sitemapEntryOf,
  type ContentPage,
} from '@/lib/sitemap-entry';

const UPDATED_AT = new Map([['/termos/', '2026-11-01']]);

function page(overrides: Partial<ContentPage>): ContentPage {
  return {
    path: '/recursos/x/',
    updatedAt: '2026-11-20',
    draft: false,
    kind: 'recurso',
    ...overrides,
  };
}

describe('sitemapEntryOf', () => {
  it('dates a URL with the updatedAt of its content page', () => {
    const entry = sitemapEntryOf({ url: 'https://lorkarium.test/termos/' }, UPDATED_AT);

    expect(entry).toEqual({
      url: 'https://lorkarium.test/termos/',
      lastmod: '2026-11-01T00:00:00.000Z',
    });
  });

  it('leaves lastmod out of a URL no content page dates, never the build date', () => {
    const entry = sitemapEntryOf({ url: 'https://lorkarium.test/' }, UPDATED_AT);

    expect(entry).toEqual({ url: 'https://lorkarium.test/' });
  });
});

describe('isoDateOf', () => {
  it('reads the long pt-BR date of the legal pages', () => {
    expect(isoDateOf('19 de novembro de 2026')).toBe('2026-11-19T00:00:00.000Z');
    expect(isoDateOf('1 de março de 2027')).toBe('2027-03-01T00:00:00.000Z');
  });

  it('refuses a date it cannot read, citing it', () => {
    expect(() => isoDateOf('ontem')).toThrow(/"ontem".*expected YYYY-MM-DD/);
    expect(() => isoDateOf('3 de brumário de 2026')).toThrow(/brumário/);
  });
});

describe('isIndexablePath', () => {
  it('keeps the thank-you and the error pages out of the index', () => {
    expect(isIndexablePath('/obrigado/', [])).toBe(false);
    expect(isIndexablePath('/404/', [])).toBe(false);
  });

  it('indexes the pages that sell and the published guides', () => {
    expect(isIndexablePath('/', [])).toBe(true);
    expect(isIndexablePath('/recursos/dados-3d/', [])).toBe(true);
  });

  it('keeps out the paths it is told to hide', () => {
    expect(isIndexablePath('/recursos/', ['/recursos/'])).toBe(false);
  });
});

describe('hiddenPathsOf', () => {
  it('hides drafts and the hub left with no published guide', () => {
    const hidden = hiddenPathsOf([
      page({ path: '/recursos/x/', draft: true }),
      page({ path: '/termos/', kind: 'legal' }),
    ]);

    expect(hidden).toEqual(['/recursos/x/', '/recursos/']);
  });

  it('hides no hub that has a published guide', () => {
    const hidden = hiddenPathsOf([page({}), page({ path: '/recursos/y/', draft: true })]);

    expect(hidden).toEqual(['/recursos/y/']);
  });
});

describe('contentPageOf', () => {
  it('maps a recurso guide to its route under /recursos/', () => {
    const source = '---\nkind: recurso\ntitle: x\nupdatedAt: 2026-11-20\ndraft: true\n---\ncorpo';

    expect(contentPageOf('guides/recursos/dados-3d.md', source)).toEqual({
      path: '/recursos/dados-3d/',
      updatedAt: '2026-11-20',
      draft: true,
      kind: 'recurso',
    });
  });

  it('maps a legal page to the site root', () => {
    const legal = '---\ntitle: Termos\nupdatedAt: 19 de novembro de 2026\ndraft: false\n---';

    expect(contentPageOf('legal/termos.md', legal).path).toBe('/termos/');
  });

  it('refuses a guide of an unknown kind, citing it and the accepted one', () => {
    const source = "---\nkind: sistema\nupdatedAt: '2026-11-20'\ndraft: false\n---";

    expect(() => contentPageOf('guides/sistemas/x.md', source)).toThrow(
      /"sistema".*expected recurso/,
    );
  });
});
