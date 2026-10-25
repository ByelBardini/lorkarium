import { readFileSync } from 'node:fs';
import path from 'node:path';

const INDEX_HTML = readFileSync(path.join(import.meta.dirname, '../../index.html'), 'utf8');

/** Loads the real `index.html` body into the jsdom document, so specs see the nodes the splash ships with. */
export function loadSplashDocument(): Document {
  document.documentElement.innerHTML = new DOMParser().parseFromString(
    INDEX_HTML,
    'text/html',
  ).documentElement.innerHTML;
  return document;
}
