import type { Editor } from '@tiptap/core';

/** Captures the browser selection before a toolbar control takes focus. Example: `captureDocumentSelection(editor)`. */
export function captureDocumentSelection(editor: Editor): void {
  if (editor.isDestroyed) return;
  const view = editor.view;
  const selection = view.dom.ownerDocument.getSelection();
  if (!selection?.anchorNode || !selection.focusNode) return;
  if (!view.dom.contains(selection.anchorNode) || !view.dom.contains(selection.focusNode)) return;
  const anchor = view.posAtDOM(selection.anchorNode, selection.anchorOffset);
  const head = view.posAtDOM(selection.focusNode, selection.focusOffset);
  if (
    editor.state.selection.from === Math.min(anchor, head) &&
    editor.state.selection.to === Math.max(anchor, head)
  )
    return;
  editor.commands.setTextSelection({ from: Math.min(anchor, head), to: Math.max(anchor, head) });
}
