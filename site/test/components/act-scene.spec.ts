import { describe, expect, it } from 'vitest';
import ActScene from '@/components/act-scene.astro';
import { landingCopy } from '@/copy/landing-copy';
import { renderAstro } from '../support/render-astro';

describe('ActScene', () => {
  it('opens act I as the #cena section', async () => {
    const act = await renderAstro(ActScene);

    expect(act.querySelector('section#cena h2')?.textContent?.trim()).toBe('Prepare a cena');
  });

  it('lists the scene features from the catalog, in the act order', async () => {
    const act = await renderAstro(ActScene);

    const titles = [...act.querySelectorAll('h3')].map((title) => title.textContent?.trim());
    expect(titles).toEqual(['Biblioteca de grids', 'Grid de combate', 'Visão, luz e paredes']);
    expect(act.body.textContent).toContain(landingCopy.features[4]?.text);
  });

  it('shows the board capture with a description', async () => {
    const act = await renderAstro(ActScene);

    expect(act.querySelector('img')?.alt).toMatch(/Kael/);
  });
});
