import { describe, expect, it } from 'vitest';
import ActCombat from '@/components/act-combat.astro';
import { renderAstro } from '../support/render-astro';

describe('ActCombat', () => {
  it('opens act IV as the #combate section', async () => {
    const act = await renderAstro(ActCombat);

    expect(act.querySelector('section#combate h2')?.textContent?.trim()).toBe('O combate');
  });

  it('lists bars, conditions, forms and programmable sheets from the catalog', async () => {
    const act = await renderAstro(ActCombat);

    const titles = [...act.querySelectorAll('h3')].map((title) => title.textContent?.trim());
    expect(titles).toEqual([
      'Barras de recursos',
      'Condições e duração',
      'Formas e auras',
      'Fichas programáveis',
    ]);
  });

  it('says what a programmable sheet does at the table', async () => {
    const act = await renderAstro(ActCombat);

    const sheet = [...act.querySelectorAll('li')].find((item) =>
      item.querySelector('h3')?.textContent?.includes('Fichas programáveis'),
    );
    expect(sheet?.textContent).toMatch(/HTML, CSS e JavaScript/);
    expect(sheet?.textContent).toMatch(/barras do token/);
  });
});
