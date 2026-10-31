import { describe, expect, it } from 'vitest';
import Hero from '@/components/hero.astro';
import { CELL_PX } from '@/lib/hero-scene';
import { renderAstro, renderAstroHtml } from '../support/render-astro';

function bodyCentresOf(hero: Document, size: string): number[][] {
  return [
    ...hero.querySelectorAll(`[data-scene-token][data-token-size="${size}"] [data-token-body]`),
  ].map((circle) => [Number(circle.getAttribute('cx')), Number(circle.getAttribute('cy'))]);
}

describe('Hero', () => {
  it('opens the page with the approved headline as the only h1', async () => {
    const hero = await renderAstro(Hero);

    const headings = hero.querySelectorAll('section#topo h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Role a iniciativa. E que comece o combate.',
    );
  });

  it('offers the Windows download with the release line and the platform notes', async () => {
    const hero = await renderAstro(Hero);

    expect(hero.querySelector('a[data-download-cta]')?.textContent?.trim()).toBe(
      'Baixar para Windows',
    );
    expect(hero.querySelector('[data-release-meta]')).not.toBeNull();
    expect(hero.querySelector('[data-platform-note]')).not.toBeNull();
  });

  it('describes the background scene to screen readers', async () => {
    const hero = await renderAstro(Hero);

    const scene = hero.querySelector('svg[role="img"]');
    expect(scene?.getAttribute('aria-label')).toMatch(/Ogro das Cinzas/);
  });

  it('keeps every one-cell token in the middle of a cell, never on a grid line', async () => {
    const hero = await renderAstro(Hero);

    const centres = bodyCentresOf(hero, '1');
    expect(centres.length).toBeGreaterThan(0);
    expect(centres.flat().filter((value) => value % CELL_PX !== CELL_PX / 2)).toEqual([]);
  });

  it('keeps the 2×2 ogre on a grid crossing', async () => {
    const hero = await renderAstro(Hero);

    expect(
      bodyCentresOf(hero, '2')
        .flat()
        .map((value) => value % CELL_PX),
    ).toEqual([0, 0]);
  });

  it('draws the drag trail through the centre of every cell, as the board does', async () => {
    const hero = await renderAstro(Hero);

    const trail = hero.querySelector('[data-drag-trail]')?.getAttribute('d') ?? '';
    const points = [...trail.matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)].map((match) => [
      Number(match[1]),
      Number(match[2]),
    ]);
    expect(points.length).toBeGreaterThan(2);
    expect(points.flat().filter((value) => value % CELL_PX !== CELL_PX / 2)).toEqual([]);
  });

  it('labels the drag with one cell per step of the trail', async () => {
    const hero = await renderAstro(Hero);

    const steps = (hero.querySelector('[data-drag-trail]')?.getAttribute('d')?.match(/L/g) ?? [])
      .length;
    expect(hero.querySelector('[data-drag-label]')?.textContent?.trim()).toBe(
      `${steps} casas · ${(steps * 1.5).toString().replace('.', ',')} m`,
    );
  });

  it('moves the scene and the tokens at the same parallax depth', async () => {
    const hero = await renderAstro(Hero);

    const depths = [...hero.querySelectorAll('svg[data-scene-layer]')].map((layer) =>
      layer.getAttribute('data-parallax-depth'),
    );
    expect(depths).toHaveLength(2);
    expect(new Set(depths)).toEqual(new Set(['0.3']));
  });

  it('gives every parallax layer a depth between 0 and 1', async () => {
    const hero = await renderAstro(Hero);

    const depths = [...hero.querySelectorAll('[data-parallax-depth]')].map((layer) =>
      Number(layer.getAttribute('data-parallax-depth')),
    );
    expect(depths.filter((depth) => !(depth >= 0 && depth <= 1))).toEqual([]);
  });

  it('writes no inline style attribute, which the CSP would refuse', async () => {
    const html = await renderAstroHtml(Hero);

    expect(html).not.toMatch(/\sstyle=/);
  });
});
