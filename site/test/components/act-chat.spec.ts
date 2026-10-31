import { describe, expect, it } from 'vitest';
import ActChat from '@/components/act-chat.astro';
import { landingCopy } from '@/copy/landing-copy';
import { renderAstro } from '../support/render-astro';

describe('ActChat', () => {
  it('opens act VI as the #chat section', async () => {
    const act = await renderAstro(ActChat);

    expect(act.querySelector('section#chat h2')?.textContent?.trim()).toBe('A conversa');
  });

  it('shows the chat capture with a description', async () => {
    const act = await renderAstro(ActChat);

    expect(act.querySelector('img')?.getAttribute('alt')).toMatch(/sussurro/);
  });

  it('lists the chat points from the catalog', async () => {
    const act = await renderAstro(ActChat);

    const text = act.body.textContent ?? '';
    expect(landingCopy.chat.points.filter((point) => !text.includes(point))).toEqual([]);
  });
});
