import { describe, expect, it } from 'vitest';
import GuideHub from '@/components/guide-hub.astro';
import type { GuideEntry } from '@/lib/guides';
import RecursosHub from '@/pages/recursos/index.astro';
import { guideEntry } from '../support/guide-factory';
import { renderAstro } from '../support/render-astro';

const HUB_PROPS = {
  kind: 'recurso',
  name: 'Recursos',
  title: 'Recursos da mesa virtual de RPG · Lorkarium',
  description: 'd'.repeat(80),
  h1: 'Recursos da sua mesa',
  lead: 'Tudo o que a sessão usa.',
};

function renderHub(guides: readonly GuideEntry[]): Promise<Document> {
  return renderAstro(GuideHub, { props: { ...HUB_PROPS, guides }, path: '/recursos/' });
}

function cardHrefs(page: Document): (string | null)[] {
  return [...page.querySelectorAll('[data-hub-cards] a')].map((a) => a.getAttribute('href'));
}

describe('the guide hub', () => {
  it('lists one card per guide, in the order of the order field', async () => {
    const page = await renderHub([
      guideEntry('recursos/dados-3d', { order: 2 }),
      guideEntry('recursos/grid-de-combate', { order: 1, name: 'Grid de combate' }),
    ]);

    expect(cardHrefs(page)).toEqual(['/recursos/grid-de-combate/', '/recursos/dados-3d/']);
    expect(page.querySelector('[data-hub-cards] h2')?.textContent).toBe('Grid de combate');
  });

  it('stays indexable while it has a published guide', async () => {
    const page = await renderHub([guideEntry('recursos/dados-3d')]);

    expect(page.querySelector('meta[name="robots"]')).toBeNull();
    expect(page.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(
      'https://lorkarium.test/og-recursos.png',
    );
  });

  it('keeps out of the index while every guide of it is a draft', async () => {
    const page = await renderHub([guideEntry('recursos/dados-3d', { draft: true })]);

    expect(page.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
  });

  it('says the pages are coming when it has nothing to list', async () => {
    const page = await renderHub([]);

    expect(page.querySelector('[data-hub-empty]')).not.toBeNull();
    expect(page.querySelector('[data-hub-cards]')).toBeNull();
  });

  it('/recursos/ opens with one h1 and its trail', async () => {
    const page = await renderAstro(RecursosHub, { path: '/recursos/' });

    expect(page.querySelectorAll('h1')).toHaveLength(1);
    expect(page.querySelector('nav[aria-label="Trilha"] [aria-current="page"]')).not.toBeNull();
  });
});
