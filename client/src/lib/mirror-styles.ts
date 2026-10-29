const STYLE_SELECTOR = 'link[rel="stylesheet"], style';
const MIRRORED_MARK = 'data-mirrored-style';

/** Copies every stylesheet of `source`'s head into `target`'s head and keeps them in step: a
 *  chunk's CSS loaded later, or Vite's dev `<style>` rewritten by a hot update, is copied again.
 *  Returns the stop, which removes the copies.
 *
 *  Example: `const stop = mirrorStyles(document, chatWindow.document); …; stop()` */
export function mirrorStyles(source: Document, target: Document): () => void {
  const copy = (): void => replaceMirroredStyles(source, target);
  copy();
  const observer = new MutationObserver(copy);
  observer.observe(source.head, { childList: true, subtree: true, characterData: true });
  return () => {
    observer.disconnect();
    removeMirroredStyles(target);
  };
}

function replaceMirroredStyles(source: Document, target: Document): void {
  removeMirroredStyles(target);
  for (const sheet of source.head.querySelectorAll(STYLE_SELECTOR)) {
    const clone = target.importNode(sheet, true);
    clone.setAttribute(MIRRORED_MARK, '');
    target.head.append(clone);
  }
}

function removeMirroredStyles(target: Document): void {
  for (const copy of target.head.querySelectorAll(`[${MIRRORED_MARK}]`)) copy.remove();
}
