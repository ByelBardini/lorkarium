import { describe, expect, it } from 'vitest';
import FeatureGrid from '@/components/feature-grid.astro';
import { landingCopy } from '@/copy/landing-copy';
import { renderAstro } from '../support/render-astro';

describe('FeatureGrid', () => {
  it('renders one article per feature, in the copy order', async () => {
    const grid = await renderAstro(FeatureGrid);

    const titles = [...grid.querySelectorAll('article h3')].map((h3) => h3.textContent?.trim());
    expect(titles).toEqual(landingCopy.features.map((feature) => feature.title));
  });

  it('shows each feature text under its title', async () => {
    const grid = await renderAstro(FeatureGrid);

    const firstText = grid.querySelector('article p')?.textContent?.trim();
    expect(firstText).toBe(landingCopy.features[0]?.text);
  });

  it('promises vision, light and walls instead of dice', async () => {
    const grid = await renderAstro(FeatureGrid);

    expect(grid.body.textContent).toContain('Visão, luz e paredes');
    expect(grid.body.textContent).not.toMatch(/dados rolam/i);
  });
});
