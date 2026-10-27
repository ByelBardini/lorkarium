import type { SplashProgress, SplashView } from './splash-state';

export type SplashElements = {
  title: HTMLElement;
  detail: HTMLElement;
  bar: HTMLElement;
  fill: HTMLElement;
  retry: HTMLButtonElement;
};

/** The splash's nodes, looked up once by id from `index.html`; a missing one is a packaging bug.
 *
 *  Example: `const elements = splashElementsOf(document)` */
export function splashElementsOf(root: Document): SplashElements {
  return {
    title: requireElement(root, 'splash-title'),
    detail: requireElement(root, 'splash-detail'),
    bar: requireElement(root, 'splash-bar'),
    fill: requireElement(root, 'splash-fill'),
    retry: requireElement(root, 'splash-retry') as HTMLButtonElement,
  };
}

/** One node of `index.html` by id; a missing one is a packaging bug.
 *
 *  Example: `requireElement(document, 'splash-title')` */
export function requireElement(root: Document, id: string): HTMLElement {
  const element = root.getElementById(id);
  if (element === null) throw new Error(`splash sem o elemento #${id}; esperado em index.html`);
  return element;
}

/** Puts a view on screen.
 *
 *  Example: `renderSplash(elements, splashViewOf(INITIAL_SPLASH_VIEW, event))` */
export function renderSplash(elements: SplashElements, view: SplashView): void {
  elements.title.textContent = view.title;
  elements.detail.textContent = view.detail ?? '';
  elements.detail.hidden = view.detail === null;
  elements.retry.hidden = !view.canRetry;
  renderProgress(elements, view.progress);
}

function renderProgress(elements: SplashElements, progress: SplashProgress): void {
  elements.bar.hidden = progress.kind === 'none';
  elements.bar.dataset.mode = progress.kind;
  const percent = progress.kind === 'determinate' ? progress.percent : null;
  elements.fill.style.width = percent === null ? '' : `${percent}%`;
  if (percent === null) elements.bar.removeAttribute('aria-valuenow');
  else elements.bar.setAttribute('aria-valuenow', String(percent));
}
