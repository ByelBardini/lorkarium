import { EditorState } from '@codemirror/state';
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { useEffect, useEffectEvent, useRef } from 'react';
import { codeEditorExtensions, type CodeLanguage } from './code-editor-setup';

export type { CodeLanguage } from './code-editor-setup';

export type CodeEditorProps = Readonly<{
  value: string;
  language: CodeLanguage;
  /** The accessible name of the text area ("HTML do modelo"). */
  label: string;
  onChange: (value: string) => void;
}>;

/** A CodeMirror 6 field over one text: what the author types goes to `onChange`, and a `value`
 *  changed from outside (a loaded version) replaces the text. The language is fixed per mount.
 *  The only place of the app that imports CodeMirror; load it with `lazy`.
 *
 *  Example: `const CodeEditor = lazy(() => import('@/code-editor/code-editor'))` */
export default function CodeEditor(props: CodeEditorProps): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const emitChange = useEffectEvent((update: ViewUpdate) => {
    if (update.docChanged) props.onChange(update.state.doc.toString());
  });
  // A remount (another language) starts from the text as it is now.
  const currentText = useEffectEvent(() => props.value);
  const { language, label } = props;
  useEffect(() => {
    if (!host.current) return;
    const listener = EditorView.updateListener.of((update) => emitChange(update));
    const extensions = [...codeEditorExtensions(language, label), listener];
    const state = EditorState.create({ doc: currentText(), extensions });
    view.current = new EditorView({ state, parent: host.current });
    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, [language, label]);
  useEffect(() => replaceText(view.current, props.value), [props.value]);
  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}

function replaceText(view: EditorView | null, text: string): void {
  if (!view || view.state.doc.toString() === text) return;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
}
