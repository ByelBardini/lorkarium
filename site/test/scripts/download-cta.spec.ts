import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it } from 'vitest';
import Hero from '@/components/hero.astro';
import DownloadPanel from '@/components/download-panel.astro';
import { enhanceDownloadCtas } from '@/scripts/download-cta';
import type { VisitorPlatform } from '@/lib/visitor-platform';
import { LinkClipboardFake } from '../support/link-clipboard-fake';
import { RELEASE_0_3_1, ReleaseSourceFake } from '../support/release-source-fake';
import { renderAstroHtml } from '../support/render-astro';

let document: Document;

async function renderLanding(): Promise<void> {
  const html = (await renderAstroHtml(Hero)) + (await renderAstroHtml(DownloadPanel));
  document = new JSDOM(html).window.document;
}

function enhance(
  platform: VisitorPlatform,
  source = new ReleaseSourceFake(RELEASE_0_3_1),
  clipboard = new LinkClipboardFake(),
): Promise<void> {
  return enhanceDownloadCtas(document, {
    source,
    platform,
    clipboard,
    pageUrl: 'https://lorkarium.test/',
  });
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function visibleNotes(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[data-platform-note]')]
    .filter((note) => !note.hidden)
    .map((note) => note.dataset.platformNote ?? '');
}

describe('enhanceDownloadCtas', () => {
  beforeEach(renderLanding);

  it('shows the version and size of the release on every download line', async () => {
    await enhance('windows');

    const metas = [...document.querySelectorAll<HTMLElement>('[data-release-meta]')];
    expect(metas).toHaveLength(2);
    for (const meta of metas) {
      expect(meta.hidden).toBe(false);
      expect(meta.querySelector('[data-release-version]')?.textContent).toBe('0.3.1');
      expect(meta.querySelector('[data-release-size]')?.textContent).toBe('8,4 MB');
    }
  });

  it('keeps the meta hidden and the thank-you link when the release is unknown', async () => {
    await enhance('windows', new ReleaseSourceFake(null));

    const metas = [...document.querySelectorAll<HTMLElement>('[data-release-meta]')];
    expect(metas.every((meta) => meta.hidden)).toBe(true);
    const ctas = [...document.querySelectorAll('a[data-download-cta]')];
    expect(ctas.every((cta) => cta.getAttribute('href') === '/obrigado/')).toBe(true);
  });

  it('shows no platform note on Windows or an unknown system', async () => {
    await enhance('windows');
    expect(visibleNotes()).toEqual([]);

    await enhance('unknown');
    expect(visibleNotes()).toEqual([]);
  });

  it.each(['mac', 'linux'] as const)(
    'points a %s visitor to the browser version',
    async (platform) => {
      await enhance(platform);

      expect(visibleNotes()).toEqual(['desktop-browser']);
      const note = document.querySelector('[data-platform-note="desktop-browser"]');
      expect(note?.querySelector('a')?.getAttribute('href')).toBe(
        'https://mesa.lorkarium.test/login',
      );
    },
  );

  it('tells phone visitors to open the site on a computer', async () => {
    await enhance('mobile');

    expect(visibleNotes()).toEqual(['mobile']);
  });

  it('copies the landing link for a phone visitor', async () => {
    const clipboard = new LinkClipboardFake();
    await enhance('mobile', new ReleaseSourceFake(RELEASE_0_3_1), clipboard);

    document.querySelector<HTMLButtonElement>('[data-copy-link]')?.click();
    await settle();

    expect(clipboard.copied).toEqual(['https://lorkarium.test/']);
    expect(document.querySelector('[data-copy-status]')?.textContent).toBe('Link copiado.');
  });

  it('says so when the browser refuses the clipboard', async () => {
    await enhance('mobile', new ReleaseSourceFake(RELEASE_0_3_1), new LinkClipboardFake().refuse());

    document.querySelector<HTMLButtonElement>('[data-copy-link]')?.click();
    await settle();

    expect(document.querySelector('[data-copy-status]')?.textContent).toBe(
      'Não foi possível copiar o link. Copie o endereço na barra do navegador.',
    );
  });
});
