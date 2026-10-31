import { describe, expect, it } from 'vitest';
import ActHeading from '@/components/act-heading.astro';
import { renderAstro } from '../support/render-astro';

const props = { numeral: 'III', title: 'Role a iniciativa' };

describe('ActHeading', () => {
  it('shows the act title as the h2', async () => {
    const heading = await renderAstro(ActHeading, { props });

    expect(heading.querySelector('h2')?.textContent?.trim()).toBe('Role a iniciativa');
  });

  it('hides the roman numeral from screen readers', async () => {
    const heading = await renderAstro(ActHeading, { props });

    const numeral = [...heading.querySelectorAll('[aria-hidden="true"]')].find(
      (element) => element.textContent?.trim() === 'III',
    );
    expect(numeral).toBeDefined();
  });

  it('puts the slotted lead in a paragraph after the h2', async () => {
    const heading = await renderAstro(ActHeading, {
      props,
      slots: { default: 'Lyra age primeiro.' },
    });

    const lead = heading.querySelector('h2 ~ p');
    expect(lead?.textContent?.trim()).toBe('Lyra age primeiro.');
  });

  it('renders no empty paragraph without a lead', async () => {
    const heading = await renderAstro(ActHeading, { props });

    expect(heading.querySelector('p')).toBeNull();
  });
});
