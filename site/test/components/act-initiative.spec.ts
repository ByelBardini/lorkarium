import { describe, expect, it } from 'vitest';
import ActInitiative from '@/components/act-initiative.astro';
import { landingCopy } from '@/copy/landing-copy';
import { renderAstro } from '../support/render-astro';

describe('ActInitiative', () => {
  it('opens act III as the #iniciativa section', async () => {
    const act = await renderAstro(ActInitiative);

    expect(act.querySelector('section#iniciativa h2')?.textContent?.trim()).toBe(
      'Role a iniciativa',
    );
  });

  it('sets the tracker beside the heading, not below it', async () => {
    const act = await renderAstro(ActInitiative);

    const aside = act.querySelector('section#iniciativa [data-act-aside]');
    expect(aside?.querySelector('[data-encounter-tracker]')).not.toBeNull();
    expect(aside?.querySelector('h2')).toBeNull();
  });

  it('explains what the staged round shows with the catalog points', async () => {
    const act = await renderAstro(ActInitiative);

    const text = act.body.textContent ?? '';
    expect(landingCopy.initiativePoints.length).toBeGreaterThan(0);
    expect(landingCopy.initiativePoints.filter((point) => !text.includes(point))).toEqual([]);
  });
});
