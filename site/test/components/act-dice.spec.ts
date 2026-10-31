import { describe, expect, it } from 'vitest';
import ActDice from '@/components/act-dice.astro';
import { landingCopy } from '@/copy/landing-copy';
import { renderAstro } from '../support/render-astro';

describe('ActDice', () => {
  it('opens act V as the #dados section', async () => {
    const act = await renderAstro(ActDice);

    expect(act.querySelector('section#dados h2')?.textContent?.trim()).toBe('Os dados');
  });

  it('puts the dice capture as the poster of the dice stage', async () => {
    const act = await renderAstro(ActDice);

    const poster = act.querySelector('[data-dice-stage] img');
    expect(poster?.getAttribute('alt')).toMatch(/dados 3D/i);
  });

  it('keeps the roll button hidden until the script shows it', async () => {
    const act = await renderAstro(ActDice);

    const roll = act.querySelector('[data-dice-stage] button[data-dice-roll]');
    expect(roll?.textContent?.trim()).toBe('Rolar o d20');
    expect(roll?.hasAttribute('hidden')).toBe(true);
  });

  it('announces the total in a polite live region', async () => {
    const act = await renderAstro(ActDice);

    expect(act.querySelector('[data-dice-total]')?.getAttribute('aria-live')).toBe('polite');
  });

  it('lists the dice points from the catalog', async () => {
    const act = await renderAstro(ActDice);

    const text = act.body.textContent ?? '';
    expect(landingCopy.dice.points.filter((point) => !text.includes(point))).toEqual([]);
  });
});
