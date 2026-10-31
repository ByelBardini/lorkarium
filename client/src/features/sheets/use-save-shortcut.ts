import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isSaveShortcut } from '@/lib/save-shortcut';

// A window of its own (the editor's) is another realm, so `instanceof Node` would refuse it.
function isNode(target: EventTarget | null): target is Node {
  return typeof (target as Partial<Node> | null)?.nodeType === 'number';
}

// Inside the editor, or nothing focused (the body) with the editor on screen.
function ownsTheKey(target: EventTarget | null, editor: HTMLElement): boolean {
  if (isNode(target) && editor.contains(target)) return true;
  return target === editor.ownerDocument.body && editor.closest('[hidden]') === null;
}

/** Ctrl+S / Cmd+S saves while the focus is inside the editor (the code field included) or
 *  nowhere with the editor shown; only then is the browser's "save page" kept from opening.
 *  Listens on the editor's own document, so it works in the editor's window too. A press inside
 *  the sheet's frame (another document) never reaches it. Returns the ref of the editor.
 *
 *  Example: `const editorRef = useSaveShortcut(() => model.save()); <section ref={editorRef}>` */
export function useSaveShortcut(onSave: () => void): (element: HTMLElement | null) => void {
  const [editor, setEditor] = useState<HTMLElement | null>(null);
  const save = useRef(onSave);
  useLayoutEffect(() => {
    save.current = onSave;
  });
  useEffect(() => {
    if (!editor) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isSaveShortcut(event) || !ownsTheKey(event.target, editor)) return;
      event.preventDefault();
      save.current();
    };
    const page = editor.ownerDocument;
    page.addEventListener('keydown', onKeyDown, true);
    return () => page.removeEventListener('keydown', onKeyDown, true);
  }, [editor]);
  return setEditor;
}
