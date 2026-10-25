import { beforeEach, describe, expect, it } from 'vitest';
import ThankYouPage from '@/pages/obrigado.astro';
import { RELEASES_PAGE_URL } from '@/lib/desktop-release';
import { startDesktopDownload } from '@/scripts/thank-you';
import { PageNavigatorFake } from '../support/page-navigator-fake';
import { RELEASE_0_3_1, ReleaseSourceFake } from '../support/release-source-fake';
import { renderAstro } from '../support/render-astro';

let document: Document;

function manualLink(): HTMLAnchorElement | null {
  return document.querySelector<HTMLAnchorElement>('a[data-manual-download]');
}

function fallbackNotice(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-download-fallback]');
}

describe('startDesktopDownload', () => {
  beforeEach(async () => {
    document = await renderAstro(ThankYouPage, { path: '/obrigado/' });
  });

  it('offers the releases page by hand before the release is known', () => {
    expect(manualLink()?.getAttribute('href')).toBe(RELEASES_PAGE_URL);
    expect(fallbackNotice()?.hidden).toBe(true);
  });

  it('starts the installer download once and points the manual link at it', async () => {
    const navigator = new PageNavigatorFake();

    await startDesktopDownload(document, {
      source: new ReleaseSourceFake(RELEASE_0_3_1),
      navigator,
    });

    expect(navigator.assigned).toEqual([RELEASE_0_3_1.url]);
    expect(manualLink()?.getAttribute('href')).toBe(RELEASE_0_3_1.url);
    expect(document.querySelector('[data-release-label]')?.textContent).toBe(
      'Lorkarium 0.3.1 · 8,4 MB',
    );
  });

  it('keeps the releases page and explains when the release is unknown', async () => {
    const navigator = new PageNavigatorFake();

    await startDesktopDownload(document, { source: new ReleaseSourceFake(null), navigator });

    expect(navigator.assigned).toEqual([]);
    expect(manualLink()?.getAttribute('href')).toBe(RELEASES_PAGE_URL);
    expect(fallbackNotice()?.hidden).toBe(false);
  });

  it('leaves the manual link usable while the release is still loading', async () => {
    const source = new ReleaseSourceFake(RELEASE_0_3_1).hold();
    const navigator = new PageNavigatorFake();

    const started = startDesktopDownload(document, { source, navigator });

    expect(manualLink()?.getAttribute('href')).toBe(RELEASES_PAGE_URL);
    expect(navigator.assigned).toEqual([]);
    source.answer();
    await started;
    expect(navigator.assigned).toEqual([RELEASE_0_3_1.url]);
  });
});
