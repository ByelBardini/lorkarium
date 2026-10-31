import { describe, expect, it } from 'vitest';
import IndexPage from '@/pages/index.astro';
import { renderAstro } from '../support/render-astro';

describe('the landing page', () => {
  it('renders in pt-BR with the product title', async () => {
    const page = await renderAstro(IndexPage);

    expect(page.documentElement.lang).toBe('pt-BR');
    expect(page.title).toBe('Lorkarium · Mapas e combate para o seu RPG');
  });

  it('shows the LORKARIUM wordmark', async () => {
    const page = await renderAstro(IndexPage);

    expect(page.body.textContent).toContain('LORKARIUM');
  });

  it('puts the sections in the order of the pitch', async () => {
    const page = await renderAstro(IndexPage);

    const ids = [...page.querySelectorAll('section[id]')].map((section) => section.id);
    expect(ids).toEqual([
      'topo',
      'cena',
      'grupo',
      'iniciativa',
      'combate',
      'dados',
      'chat',
      'baixar',
      'perguntas',
    ]);
  });

  it('has a target for every in-page anchor', async () => {
    const page = await renderAstro(IndexPage);

    const anchors = [...page.querySelectorAll('a[href]')]
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => /^\/?#/.test(href))
      .map((href) => href.replace(/^\/?#/, ''));
    const missing = anchors.filter((id) => page.getElementById(id) === null);
    expect(anchors.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('gives every image an alt text and fixed dimensions', async () => {
    const page = await renderAstro(IndexPage);

    const images = [...page.querySelectorAll('img')];
    const loose = images.filter(
      (img) => !img.alt || !img.getAttribute('width') || !img.getAttribute('height'),
    );
    expect(images.length).toBeGreaterThan(0);
    expect(loose.map((img) => img.outerHTML)).toEqual([]);
  });

  it('closes the session with the download act', async () => {
    const page = await renderAstro(IndexPage);

    expect(page.querySelector('#baixar h2')?.textContent?.trim()).toBe('Baixe e jogue');
  });

  it('offers an invite request next to the download', async () => {
    const page = await renderAstro(IndexPage);

    const download = page.getElementById('baixar');
    expect(download?.querySelector('a[data-download-cta]')).not.toBeNull();
    expect(
      download?.querySelector('a[href^="mailto:contato@lorkarium.test"]')?.textContent,
    ).toContain('Pedir convite');
  });
});
