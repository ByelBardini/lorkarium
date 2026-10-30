import { describe, expect, it } from 'vitest';
import DownloadCta from '@/components/download-cta.astro';
import ReleaseMeta from '@/components/release-meta.astro';
import { renderAstro } from '../support/render-astro';

describe('DownloadCta', () => {
  it('links to the thank-you page, which works without JS', async () => {
    const cta = await renderAstro(DownloadCta);

    const link = cta.querySelector<HTMLAnchorElement>('a[data-download-cta]');
    expect(link?.getAttribute('href')).toBe('/obrigado/');
    expect(link?.textContent?.trim()).toBe('Baixar para Windows');
  });

  it('takes a smaller variant for the header', async () => {
    const cta = await renderAstro(DownloadCta, { props: { size: 'small', label: 'Baixar' } });

    expect(cta.querySelector('a[data-download-cta]')?.textContent?.trim()).toBe('Baixar');
  });
});

describe('ReleaseMeta', () => {
  it('starts with the version and size empty and hidden', async () => {
    const meta = await renderAstro(ReleaseMeta);

    for (const selector of ['[data-release-version]', '[data-release-size]']) {
      const slot = meta.querySelector<HTMLElement>(selector);
      expect(slot?.textContent?.trim()).toBe('');
      expect(slot?.closest('[hidden]')).not.toBeNull();
    }
  });

  it('never shows a placeholder version', async () => {
    const meta = await renderAstro(ReleaseMeta);

    expect(meta.body.textContent).not.toContain('[X.Y.Z]');
    expect(meta.body.textContent).toContain('Windows 10 ou 11 · 64 bits');
  });
});
