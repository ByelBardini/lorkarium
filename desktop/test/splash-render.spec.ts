// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { renderSplash, splashElementsOf, type SplashElements } from '../src/splash-render';
import type { SplashView } from '../src/splash-state';
import { loadSplashDocument } from './support/splash-document';

const DOWNLOADING: SplashView = {
  title: 'Baixando atualização',
  detail: null,
  progress: { kind: 'determinate', percent: 42 },
  canRetry: false,
};

describe('renderSplash', () => {
  let elements: SplashElements;

  beforeEach(() => {
    elements = splashElementsOf(loadSplashDocument());
  });

  it('fills the bar to the download share and announces it', () => {
    renderSplash(elements, DOWNLOADING);

    expect(elements.title.textContent).toBe('Baixando atualização');
    expect(elements.bar.hidden).toBe(false);
    expect(elements.fill.style.width).toBe('42%');
    expect(elements.bar.getAttribute('aria-valuenow')).toBe('42');
  });

  it('shows an indeterminate bar without a value', () => {
    renderSplash(elements, DOWNLOADING);
    renderSplash(elements, { ...DOWNLOADING, progress: { kind: 'indeterminate' } });

    expect(elements.bar.dataset.mode).toBe('indeterminate');
    expect(elements.fill.style.width).toBe('');
    expect(elements.bar.hasAttribute('aria-valuenow')).toBe(false);
  });

  it('hides the bar and shows the retry button when stuck', () => {
    renderSplash(elements, {
      title: 'Sem conexão',
      detail: 'Confira a internet e tente de novo.',
      progress: { kind: 'none' },
      canRetry: true,
    });

    expect(elements.bar.hidden).toBe(true);
    expect(elements.retry.hidden).toBe(false);
    expect(elements.detail.hidden).toBe(false);
    expect(elements.detail.textContent).toBe('Confira a internet e tente de novo.');
  });

  it('hides the detail line and the retry button while working', () => {
    renderSplash(elements, DOWNLOADING);

    expect(elements.detail.hidden).toBe(true);
    expect(elements.retry.hidden).toBe(true);
  });
});

describe('splashElementsOf', () => {
  it('refuses a page without a splash node citing its id', () => {
    document.body.innerHTML = '<h1 id="splash-title"></h1>';

    expect(() => splashElementsOf(document)).toThrow('#splash-detail');
  });
});
