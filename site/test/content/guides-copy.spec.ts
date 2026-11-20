import { describe, expect, it } from 'vitest';

// The text rules of the guides that the schema cannot see: length, internal links, other VTTs and
// promises the app does not keep. The SEO guard (test/pages/seo-guard.spec.ts) covers title,
// description and h1 of the same pages.

const SOURCES = import.meta.glob<string>('/src/content/guides/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const EXPECTED_GUIDES = [
  'recursos/grid-de-combate',
  'recursos/iniciativa-e-condicoes',
  'recursos/dados-3d',
  'recursos/visao-luz-e-paredes',
  'recursos/fichas-programaveis',
  'recursos/chat-da-mesa',
];

// The guides sell the Lorkarium on its own: no page names another VTT.
const COMPETITORS = /Roll20|Foundry|Owlbear|Firecast|MasterApp|HubRPG|Fantasy Grounds|Talespire/i;

interface GuideSource {
  id: string;
  body: string;
}

function guides(): GuideSource[] {
  return Object.entries(SOURCES).map(([file, source]) => ({
    id: file.replace('/src/content/guides/', '').replace(/\.md$/, ''),
    body: source.replace(/^---[\s\S]*?\n---/, ''),
  }));
}

function wordsOf(body: string): number {
  const text = body.replace(/<[^>]+>/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  return text.split(/\s+/).filter((word) => /\p{L}/u.test(word)).length;
}

function internalLinksOf(body: string): string[] {
  return [...body.matchAll(/\]\((\/[^)\s]*)\)|href="(\/[^"]*)"/g)].map((m) => m[1] ?? m[2] ?? '');
}

describe('the guides text', () => {
  it('has every planned guide', () => {
    expect(
      guides()
        .map((guide) => guide.id)
        .toSorted(),
    ).toEqual(EXPECTED_GUIDES.toSorted());
  });

  it.each(EXPECTED_GUIDES)('%s has at least 350 words of body', (id) => {
    const guide = guides().find((candidate) => candidate.id === id);

    expect(wordsOf(guide?.body ?? '')).toBeGreaterThanOrEqual(350);
  });

  it.each(EXPECTED_GUIDES)('%s links at least two pages of the site, each ending in /', (id) => {
    const links = internalLinksOf(guides().find((candidate) => candidate.id === id)?.body ?? '');

    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links.filter((href) => !/\/(#[a-z-]+)?$/.test(href))).toEqual([]);
  });

  it('names no other VTT', () => {
    const naming = guides().filter((guide) => COMPETITORS.test(guide.body));

    expect(naming.map((guide) => guide.id)).toEqual([]);
  });

  it('shows no image in the body: captures come from src/assets/screens/ by the shot field', () => {
    const withImages = guides().filter((guide) => /!\[|<img/i.test(guide.body));

    expect(withImages.map((guide) => guide.id)).toEqual([]);
  });

  it('never promises more than the 8 bars a token takes', () => {
    const promising = guides().filter((guide) =>
      /quantas barras quiser|barras ilimitadas|(9|1\d) barras/i.test(guide.body),
    );

    expect(promising.map((guide) => guide.id)).toEqual([]);
  });
});
