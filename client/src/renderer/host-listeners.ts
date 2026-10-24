import type { Application } from 'pixi.js';
import { blocksBrowserMenu } from './camera-input';

const EDITABLE = 'input, textarea, [contenteditable]:not([contenteditable="false"])';

/** `resizeTo` only listens to the window: a host that changes size on its own (the room settling
 *  after entering) left the canvas stale and "Enquadrar cena" off-center. Returns the disposer.
 *
 *  Example: `disposers.push(followHostSize(host, app))` */
export function followHostSize(host: HTMLElement, app: Application): () => void {
  const observer = new ResizeObserver(() => app.queueResize());
  observer.observe(host);
  return () => observer.disconnect();
}

/** On the document: the right click that opens our token menu lands on the page, not the canvas.
 *  A text field keeps the browser menu. Returns the disposer.
 *
 *  Example: `disposers.push(holdBackBrowserMenu(host))` */
export function holdBackBrowserMenu(host: HTMLElement): () => void {
  const doc = host.ownerDocument;
  const onMenu = (event: MouseEvent): void => {
    const editable = event.target instanceof Element && event.target.closest(EDITABLE) !== null;
    const click = { x: event.clientX, y: event.clientY, editable };
    if (blocksBrowserMenu(click, host.getBoundingClientRect())) event.preventDefault();
  };
  doc.addEventListener('contextmenu', onMenu);
  return () => doc.removeEventListener('contextmenu', onMenu);
}
