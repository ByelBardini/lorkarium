import { describe, expect, it } from 'vitest';
import {
  guideCrumbsOf,
  guideNavLinksOf,
  guideOgImageOf,
  guidePathOf,
  guidePathsOf,
  relatedGuidesOf,
  visibleGuidesOf,
} from '@/lib/guides';
import { guideEntry } from '../support/guide-factory';

const dice = guideEntry('recursos/dados-3d', { related: ['recursos/grid-de-combate'] });
const grid = guideEntry('recursos/grid-de-combate', { name: 'Grid de combate', order: 2 });
const draft = guideEntry('recursos/chat-da-mesa', { draft: true, order: 0 });

describe('guidePathsOf', () => {
  it('builds no route for a draft when drafts are not allowed', () => {
    const paths = guidePathsOf([dice, draft], 'recurso', false);

    expect(paths).toEqual([{ params: { slug: 'dados-3d' }, props: { guide: dice } }]);
  });

  it('builds the drafts too where drafts are allowed, in hub order', () => {
    const slugs = guidePathsOf([dice, draft, grid], 'recurso', true).map((p) => p.params.slug);

    expect(slugs).toEqual(['chat-da-mesa', 'dados-3d', 'grid-de-combate']);
  });
});

describe('visibleGuidesOf', () => {
  it('sorts by order, then by id', () => {
    const tie = guideEntry('recursos/chat-da-mesa', { order: 1 });
    const ids = visibleGuidesOf([grid, dice, tie], false).map((guide) => guide.id);

    expect(ids).toEqual(['recursos/chat-da-mesa', 'recursos/dados-3d', 'recursos/grid-de-combate']);
  });
});

describe('guidePathOf and guideCrumbsOf', () => {
  it('puts a guide under its hub', () => {
    expect(guidePathOf(dice)).toBe('/recursos/dados-3d/');
  });

  it('walks from the home page through the hub to the guide', () => {
    expect(guideCrumbsOf(dice)).toEqual([
      { name: 'Início', path: '/' },
      { name: 'Recursos', path: '/recursos/' },
      { name: 'Dados 3D', path: '/recursos/dados-3d/' },
    ]);
  });

  it('shares the image of the hub', () => {
    expect(guideOgImageOf(dice)).toBe('/og-recursos.png');
  });
});

describe('relatedGuidesOf', () => {
  it('links each related id with a path ending in /', () => {
    expect(relatedGuidesOf(dice, [dice, grid])).toEqual([
      {
        id: 'recursos/grid-de-combate',
        title: 'Grid de combate',
        description: grid.data.description,
        href: '/recursos/grid-de-combate/',
      },
    ]);
  });

  it('fails on an id with no guide, citing it and the known ones', () => {
    expect(() => relatedGuidesOf(dice, [dice])).toThrow(
      /recursos\/dados-3d relates to "recursos\/grid-de-combate"; expected one of recursos\/dados-3d/,
    );
  });
});

describe('guideNavLinksOf', () => {
  it('links the hub while it has a visible guide', () => {
    expect(guideNavLinksOf([dice], false)).toEqual([{ label: 'Recursos', href: '/recursos/' }]);
  });

  it('links no hub whose guides are all drafts, unless drafts are allowed', () => {
    expect(guideNavLinksOf([draft], false)).toEqual([]);
    expect(guideNavLinksOf([draft], true)).toEqual([{ label: 'Recursos', href: '/recursos/' }]);
  });
});
