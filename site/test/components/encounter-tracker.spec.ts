import { describe, expect, it } from 'vitest';
import EncounterTracker from '@/components/encounter-tracker.astro';
import { type EncounterCopy, landingCopy } from '@/copy/landing-copy';
import { renderAstro, renderAstroHtml } from '../support/render-astro';

function rowOf(tracker: Document, name: string): Element | undefined {
  return [...tracker.querySelectorAll('li[data-combatant]')].find((row) =>
    row.textContent?.includes(name),
  );
}

const downed: EncounterCopy = {
  round: 1,
  combatants: [
    { ...landingCopy.encounter.combatants[0]!, hp: 0, hasTurn: true },
    { ...landingCopy.encounter.combatants[1]!, hasTurn: false },
  ],
};

describe('EncounterTracker', () => {
  it('lists the combatants in initiative order', async () => {
    const tracker = await renderAstro(EncounterTracker, {
      props: { encounter: landingCopy.encounter },
    });

    const initiatives = [...tracker.querySelectorAll('li[data-combatant]')].map((row) =>
      row.querySelector('[data-combatant-initiative]')?.textContent?.trim(),
    );
    expect(initiatives).toEqual(['19', '15', '14', '11', '8']);
  });

  it('marks only the combatant whose turn it is as current', async () => {
    const tracker = await renderAstro(EncounterTracker, {
      props: { encounter: landingCopy.encounter },
    });

    const current = [...tracker.querySelectorAll('[aria-current="true"]')];
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toContain('Ogro das Cinzas');
    expect(tracker.querySelector('[data-encounter-turn]')?.textContent?.trim()).toBe(
      'Ogro das Cinzas',
    );
    expect(tracker.querySelector('[data-encounter-round]')?.textContent?.trim()).toBe('3');
  });

  it('draws the hit point bar by attribute: 41 of 68 fills 60.3', async () => {
    const tracker = await renderAstro(EncounterTracker, {
      props: { encounter: landingCopy.encounter },
    });

    const ogre = rowOf(tracker, 'Ogro das Cinzas');
    expect(ogre?.querySelector('[data-combatant-hp]')?.textContent?.trim()).toBe('41 / 68');
    expect(ogre?.querySelector('rect[data-hp-fill]')?.getAttribute('width')).toBe('60.3');
  });

  it('shows the rounds left of a timed condition', async () => {
    const tracker = await renderAstro(EncounterTracker, {
      props: { encounter: landingCopy.encounter },
    });

    const poison = rowOf(tracker, 'Ogro das Cinzas')?.querySelector(
      '[data-condition="Envenenado"]',
    );
    expect(poison?.querySelector('[data-condition-rounds]')?.textContent?.trim()).toBe('2');
  });

  it('shows no number on a condition without a limit', async () => {
    const tracker = await renderAstro(EncounterTracker, {
      props: { encounter: landingCopy.encounter },
    });

    const focus = rowOf(tracker, 'Lyra')?.querySelector('[data-condition="Concentrando"]');
    expect(focus).not.toBeNull();
    expect(focus?.querySelector('[data-condition-rounds]')).toBeNull();
  });

  it('tells a downed combatant in text, not only by colour', async () => {
    const tracker = await renderAstro(EncounterTracker, { props: { encounter: downed } });

    const [down, standing] = [...tracker.querySelectorAll('[data-combatant-down]')];
    expect(down?.hasAttribute('hidden')).toBe(false);
    expect(down?.textContent?.trim()).toBe('Caído');
    expect(standing?.hasAttribute('hidden')).toBe(true);
  });

  it('keeps the pause button hidden until the script runs', async () => {
    const tracker = await renderAstro(EncounterTracker, {
      props: { encounter: landingCopy.encounter },
    });

    const pause = tracker.querySelector('button[data-round-pause]');
    expect(pause?.hasAttribute('hidden')).toBe(true);
    expect(pause?.getAttribute('aria-pressed')).toBe('false');
  });

  it('writes no inline style attribute, which the CSP would refuse', async () => {
    const html = await renderAstroHtml(EncounterTracker, {
      props: { encounter: landingCopy.encounter },
    });

    expect(html).not.toMatch(/\sstyle=/);
  });
});
