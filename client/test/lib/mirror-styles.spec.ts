import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { mirrorStyles } from '@/lib/mirror-styles';

const stops: (() => void)[] = [];

function mirroredTexts(target: Document): string[] {
  return [...target.head.querySelectorAll('style')].map((style) => style.textContent);
}

function addStyle(source: Document, css: string): HTMLStyleElement {
  const style = source.createElement('style');
  style.textContent = css;
  source.head.append(style);
  return style;
}

function startMirror(source: Document, target: Document): () => void {
  const stop = mirrorStyles(source, target);
  stops.push(stop);
  return stop;
}

describe('mirrorStyles', () => {
  afterEach(() => stops.splice(0).forEach((stop) => stop()));

  it('copies the stylesheet links and the style tags of the source head', () => {
    const source = document.implementation.createHTMLDocument('main');
    const target = document.implementation.createHTMLDocument('chat');
    source.head.innerHTML =
      '<link rel="stylesheet" href="/assets/index.css"><link rel="icon" href="/favicon.svg">';
    addStyle(source, '.a { color: red }');

    startMirror(source, target);

    const links = [...target.head.querySelectorAll('link')].map((link) =>
      link.getAttribute('href'),
    );
    expect(links).toEqual(['/assets/index.css']);
    expect(mirroredTexts(target)).toEqual(['.a { color: red }']);
  });

  it('a stylesheet added to the source later is copied too', async () => {
    const source = document.implementation.createHTMLDocument('main');
    const target = document.implementation.createHTMLDocument('chat');
    startMirror(source, target);

    addStyle(source, '.chunk { color: blue }');

    await waitFor(() => expect(mirroredTexts(target)).toEqual(['.chunk { color: blue }']));
  });

  it('a style rewritten in place (Vite hot update) is copied again', async () => {
    const source = document.implementation.createHTMLDocument('main');
    const target = document.implementation.createHTMLDocument('chat');
    const style = addStyle(source, '.a { color: red }');
    startMirror(source, target);

    style.textContent = '.a { color: green }';

    await waitFor(() => expect(mirroredTexts(target)).toEqual(['.a { color: green }']));
  });

  it('the target own styles are kept, and the stop removes only the copies', () => {
    const source = document.implementation.createHTMLDocument('main');
    const target = document.implementation.createHTMLDocument('chat');
    addStyle(target, 'body { background: #101216 }');
    addStyle(source, '.a { color: red }');
    const stop = startMirror(source, target);

    stop();

    expect(mirroredTexts(target)).toEqual(['body { background: #101216 }']);
  });

  it('after the stop, new source styles are no longer copied', async () => {
    const source = document.implementation.createHTMLDocument('main');
    const target = document.implementation.createHTMLDocument('chat');
    const stop = startMirror(source, target);
    stop();

    addStyle(source, '.late { color: red }');
    await Promise.resolve();

    expect(mirroredTexts(target)).toEqual([]);
  });
});
