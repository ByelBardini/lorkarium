import { useRef, type ReactNode } from 'react';
import type { Editor } from '@tiptap/core';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
} from '@/components/ui/context-menu';
import { isDesktopShell } from '@/lib/desktop-shell';
import { NavigatorClipboard, type Clipboard } from '@/services/clipboard';

type EditorMenuAction = 'copy' | 'cut' | 'paste' | 'select';

/** Provides the contenteditable menu in the Windows shell. Example: <DocumentEditorMenu editor={editor}>{content}</DocumentEditorMenu>. */
export function DocumentEditorMenu({
  editor,
  children,
  clipboard = new NavigatorClipboard(),
  desktop = isDesktopShell(navigator.userAgent),
}: {
  editor: Editor;
  children: ReactNode;
  clipboard?: Clipboard;
  desktop?: boolean;
}): React.JSX.Element {
  const chosen = useRef<EditorMenuAction | null>(null);
  if (!desktop) return <>{children}</>;
  const hasSelection = !editor.state.selection.empty;
  const run = (action: EditorMenuAction): void => {
    void runEditorMenuAction(editor, clipboard, action);
  };
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (editor.isDestroyed) {
            chosen.current = null;
            return;
          }
          editor.commands.focus();
          if (chosen.current) run(chosen.current);
          chosen.current = null;
        }}
      >
        <ContextMenuItem
          disabled={!editor.isEditable || !hasSelection}
          onSelect={() => {
            chosen.current = 'cut';
          }}
        >
          Recortar<ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!hasSelection}
          onSelect={() => {
            chosen.current = 'copy';
          }}
        >
          Copiar<ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!editor.isEditable}
          onSelect={() => {
            chosen.current = 'paste';
          }}
        >
          Colar<ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            chosen.current = 'select';
          }}
        >
          Selecionar tudo<ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

async function runEditorMenuAction(
  editor: Editor,
  clipboard: Clipboard,
  action: EditorMenuAction,
): Promise<void> {
  if (action === 'select') {
    editor.commands.selectAll();
    return;
  }
  if (action === 'paste') {
    const text = await clipboard.readText();
    if (text && editor.isEditable && !editor.isDestroyed)
      editor.commands.insertContent({ type: 'text', text });
    return;
  }
  const { from, to } = editor.state.selection;
  const copied = await clipboard.copy(editor.state.doc.textBetween(from, to, '\n'));
  if (copied && action === 'cut' && editor.isEditable && !editor.isDestroyed)
    editor.chain().setTextSelection({ from, to }).deleteSelection().run();
}
