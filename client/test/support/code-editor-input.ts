import { EditorView } from '@codemirror/view';
import { act, within } from '@testing-library/react';

/** The CodeMirror view behind the code field named `label`, inside `inside` when the same field
 *  shows twice (the library drawer beside the room's tab) (jsdom has no layout to type into, so
 *  a spec edits through the view, as a keystroke would).
 *
 *  Example: `codeViewOf('JS do modelo').state.doc.toString()` */
export function codeViewOf(label: string, inside: HTMLElement = document.body): EditorView {
  const content = within(inside).getByRole('textbox', { name: label });
  const root = content.closest('.cm-editor');
  const view = root instanceof HTMLElement ? EditorView.findFromDOM(root) : null;
  if (!view) throw new Error(`no CodeMirror view under the field "${label}"; expected one`);
  return view;
}

/** The text of the code field named `label`. Example: `codeTextOf('CSS do modelo')` */
export function codeTextOf(label: string, inside?: HTMLElement): string {
  return codeViewOf(label, inside).state.doc.toString();
}

/** Replaces the whole text of the code field named `label`, as typing over it would.
 *
 *  Example: `replaceCode('HTML do modelo', '<p>Força</p>')` */
export function replaceCode(label: string, text: string, inside?: HTMLElement): void {
  const view = codeViewOf(label, inside);
  act(() => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  });
}
