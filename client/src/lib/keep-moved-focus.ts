/** For a modal's `onCloseAutoFocus`: skips giving the focus back to the opener when something
 *  outside the closed modal already took it (the document title focused as the library closes).
 *  The modal is gone by then, so a focus that stayed inside it reads as `body`.
 *
 *  Example: `<DialogContent onCloseAutoFocus={keepMovedFocus}>` */
export function keepMovedFocus(event: Event, doc: Document = document): void {
  const focused = doc.activeElement;
  if (focused && focused !== doc.body) event.preventDefault();
}
