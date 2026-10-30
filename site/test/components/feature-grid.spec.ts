import { describe, expect, it } from 'vitest';
import FeatureGrid from '@/components/feature-grid.astro';
import { landingCopy } from '@/copy/landing-copy';
import { renderAstro } from '../support/render-astro';

describe('FeatureGrid', () => {
  it('groups every feature into scene preparation, combat and play', async () => {
    const grid = await renderAstro(FeatureGrid);

    const titles = [...grid.querySelectorAll('article h4')].map((heading) =>
      heading.textContent?.trim(),
    );
    const featureOrder = [0, 4, 5, 1, 2, 3, 6, 7, 8];
    expect(titles).toEqual(featureOrder.map((index) => landingCopy.features[index]?.title));
    expect([...grid.querySelectorAll('h3')].map((heading) => heading.textContent?.trim())).toEqual([
      'Prepare o cenário',
      'Conduza o combate',
      'Jogue com o grupo',
    ]);
  });

  it('shows each feature text under its title', async () => {
    const grid = await renderAstro(FeatureGrid);

    const firstText = grid.querySelector('article p')?.textContent?.trim();
    expect(firstText).toBe(landingCopy.features[0]?.text);
  });

  it('presents the board alongside dice, chat and token customization', async () => {
    const grid = await renderAstro(FeatureGrid);

    expect(grid.body.textContent).toContain('Visão, luz e paredes');
    expect(grid.body.textContent).toContain('Dados 3D na mesa');
    expect(grid.body.textContent).toContain('Chat com o grupo');
    expect(grid.body.textContent).toContain('Formas e auras');
  });
});
