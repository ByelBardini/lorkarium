import { describe, expect, it } from 'vitest';
import ActParty from '@/components/act-party.astro';
import { landingCopy } from '@/copy/landing-copy';
import { renderAstro } from '../support/render-astro';

describe('ActParty', () => {
  it('opens act II as the #grupo section', async () => {
    const act = await renderAstro(ActParty);

    expect(act.querySelector('section#grupo h2')?.textContent?.trim()).toBe('Reúna o grupo');
  });

  it('walks through the joining steps in order', async () => {
    const act = await renderAstro(ActParty);

    const steps = [...act.querySelectorAll('ol > li h3')].map((title) => title.textContent?.trim());
    expect(steps).toEqual(landingCopy.steps.map((step) => step.title));
  });

  it('says that the code admits spectators and the game master picks the players', async () => {
    const act = await renderAstro(ActParty);

    expect(act.body.textContent).toMatch(/espectador/);
    expect(act.body.textContent).toMatch(/jogador/);
  });

  it('lists the characters and the friends of act II', async () => {
    const act = await renderAstro(ActParty);

    const titles = [...act.querySelectorAll('ul h3')].map((title) => title.textContent?.trim());
    expect(titles).toEqual(['Personagens da mesa', 'Amigos e perfil']);
  });

  it('sends to the sign-up page of the app, with no invite left', async () => {
    const act = await renderAstro(ActParty);

    const signUp = act.querySelector('a[href="https://mesa.lorkarium.test/sign-up"]');
    expect(signUp?.textContent?.trim()).toBe('Criar conta');
    expect(act.body.textContent).not.toMatch(/convite/i);
    expect(act.querySelector('a[href^="mailto:"]')).toBeNull();
  });
});
