import { describe, expect, it } from 'vitest';
import GuidePage from '@/components/guide-page.astro';
import { relatedGuidesOf, type GuideEntry } from '@/lib/guides';
import { guideEntry } from '../support/guide-factory';
import { renderAstro } from '../support/render-astro';

const grid = guideEntry('recursos/grid-de-combate', { name: 'Grid de combate' });
const dice = guideEntry('recursos/dados-3d', { related: [grid.id] });
const BODY = { default: '<p id="corpo">Texto do guia.</p>' };

function renderGuide(guide: GuideEntry = dice): Promise<Document> {
  const related = relatedGuidesOf(guide, [dice, grid]);
  return renderAstro(GuidePage, {
    props: { guide, related },
    slots: BODY,
    path: '/recursos/dados-3d/',
  });
}

function graphTypes(page: Document): unknown[] {
  const script = page.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}';
  const graph = (JSON.parse(script) as { '@graph': { '@type': unknown }[] })['@graph'];
  return graph.map((node) => node['@type']);
}

describe('GuidePage', () => {
  it('opens with the h1 and the visible trail, the same as the BreadcrumbList', async () => {
    const page = await renderGuide();

    expect(page.querySelectorAll('h1')).toHaveLength(1);
    expect(page.querySelector('h1')?.textContent).toMatch(/Dados 3D online/);
    const trail = [...page.querySelectorAll('nav[aria-label="Trilha"] li')].map((li) =>
      li.textContent?.replace('›', '').trim(),
    );
    expect(trail).toEqual(['Início', 'Recursos', 'Dados 3D']);
    const current = page.querySelector('nav[aria-label="Trilha"] [aria-current="page"]');
    expect(current?.textContent?.trim()).toBe('Dados 3D');
    expect(graphTypes(page)).toContain('BreadcrumbList');
  });

  it('renders the body, the related guides and the download panel at the end', async () => {
    const page = await renderGuide();

    expect(page.querySelector('article #corpo')).not.toBeNull();
    const hrefs = [...page.querySelectorAll('[data-related-guides] a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toEqual(['/recursos/grid-de-combate/']);
    expect(page.querySelector('[data-related-guides] ~ #baixar')).not.toBeNull();
  });

  it('adds the FAQ list and the FAQPage when the guide has questions', async () => {
    const faqs = [{ question: 'Tem ficha pronta?', answer: 'Não.' }];
    const page = await renderGuide(guideEntry('recursos/dados-3d', { faqs }));

    expect(page.querySelector('#perguntas')?.textContent).toMatch(/Tem ficha pronta\?/);
    expect(graphTypes(page)).toContain('FAQPage');
  });

  it('shows neither the FAQ list nor the FAQPage without questions', async () => {
    const page = await renderGuide();

    expect(page.querySelector('#perguntas')).toBeNull();
    expect(graphTypes(page)).not.toContain('FAQPage');
  });

  it('keeps a draft out of the index and shares the hub image', async () => {
    const page = await renderGuide(guideEntry('recursos/dados-3d', { draft: true }));

    expect(page.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
    expect(page.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(
      'https://lorkarium.test/og-recursos.png',
    );
  });

  it('loads the capture at the top eagerly, as the image that paints first', async () => {
    const guide = guideEntry('recursos/dados-3d', { shot: 'tracker', shotAlt: 'Painel' });
    const page = await renderGuide(guide);

    const img = page.querySelector('article header img');
    expect(img?.getAttribute('loading')).toBe('eager');
    expect(img?.getAttribute('fetchpriority')).toBe('high');
    expect(img?.getAttribute('alt')).toBe('Painel');
  });
});
