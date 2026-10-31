const HIDDEN = '[aria-hidden="true"], [inert]';
const OPEN_MODAL = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

/** Focuses `element` once no modal stands over it. An open Radix modal traps the focus (and marks
 *  the page it knew `aria-hidden`): a focus given outside it is pulled back into the modal and lost
 *  when the modal unmounts (the document title focused as the library closes). Returns the
 *  cleanup that stops waiting.
 *
 *  Example: `useEffect(() => (input ? focusWhenUncovered(input) : undefined), [input])` */
export function focusWhenUncovered(element: HTMLElement): () => void {
  if (!isCovered(element)) {
    element.focus();
    return () => undefined;
  }
  const observer = new MutationObserver(() => {
    if (isCovered(element)) return;
    observer.disconnect();
    if (element.isConnected) element.focus();
  });
  observer.observe(element.ownerDocument.documentElement, {
    attributes: true,
    attributeFilter: ['aria-hidden', 'inert', 'data-state'],
    childList: true,
    subtree: true,
  });
  return () => observer.disconnect();
}

function isCovered(element: HTMLElement): boolean {
  if (element.closest(HIDDEN)) return true;
  const modals = Array.from(element.ownerDocument.querySelectorAll(OPEN_MODAL));
  return modals.some((modal) => !modal.contains(element));
}
