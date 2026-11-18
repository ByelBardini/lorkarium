import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { useEffect, useEffectEvent, useRef } from 'react';
import { codeEditorExtensions, type CodeCompletions, type CodeLanguage } from './code-editor-setup';

export type { CodeCompletions, CodeLanguage } from './code-editor-setup';

export type CodeEditorProps = Readonly<{
  value: string;
  language: CodeLanguage;
  /** The accessible name of the text area ("HTML do modelo"). */
  label: string;
  onChange: (value: string) => void;
  /** What to suggest while typing (fixed per mount, like the language); none without it. */
  completions?: CodeCompletions;
  /** Shows the text without taking any typing (a template past the plan); changes live. */
  readOnly?: boolean;
}>;

/** A CodeMirror 6 field over one text: what the author types goes to `onChange`, and a `value`
 *  changed from outside (a loaded version) replaces the text. The language is fixed per mount.
 *  The only place of the app that imports CodeMirror; load it with `lazy`.
 *
 *  Example: `const CodeEditor = lazy(() => import('@/code-editor/code-editor'))` */
export default function CodeEditor(props: CodeEditorProps): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const editing = useRef(new Compartment());
  const emitChange = useEffectEvent((update: ViewUpdate) => {
    if (update.docChanged) props.onChange(update.state.doc.toString());
  });
  // A remount (another language) starts from the text as it is now.
  const currentText = useEffectEvent(() => props.value);
  const currentEditing = useEffectEvent(() => editingOf(props.readOnly ?? false));
  const { language, label, completions } = props;
  const readOnly = props.readOnly ?? false;
  useEffect(() => {
    if (!host.current) return;
    const listener = EditorView.updateListener.of((update) => emitChange(update));
    const setup = codeEditorExtensions(language, label, completions);
    const extensions = [...setup, listener, editing.current.of(currentEditing())];
    const state = EditorState.create({ doc: currentText(), extensions });
    view.current = new EditorView({ state, parent: host.current });
    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, [language, label, completions]);
  useEffect(() => replaceText(view.current, props.value), [props.value]);
  useEffect(() => {
    view.current?.dispatch({ effects: editing.current.reconfigure(editingOf(readOnly)) });
  }, [readOnly]);
  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}

// Read only refuses the typing and leaves the field out of the tab's edit (contenteditable off).
function editingOf(readOnly: boolean): Extension {
  if (!readOnly) return [];
  return [
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    EditorView.contentAttributes.of({ 'aria-readonly': 'true' }),
  ];
}

function replaceText(view: EditorView | null, text: string): void {
  if (!view || view.state.doc.toString() === text) return;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
}
