import { useEffect, useMemo, useState } from 'react';
import { assetUrlOf } from '@/services/assets-api';
import { EditorContent, useEditor } from '@tiptap/react';
import { documentLinkDto, type DocumentContentDto } from '@lorkarium/contracts';
import { documentExtensions } from './document-extensions';
import { documentContentFromEditor } from './document-content-adapter';
import { DocumentToolbar } from './document-toolbar';
import { DocumentEditorMenu } from './document-editor-menu';
import './document-editor.css';

export interface DocumentEditorImage {
  assetId: string;
  alt?: string;
  align?: 'left' | 'center' | 'right';
  width?: number;
}
export interface DocumentEditorProps {
  content: DocumentContentDto;
  editable: boolean;
  onChange?: (content: DocumentContentDto) => void;
  assetUrl?: (assetId: string) => string;
  onInsertImage?: () => Promise<DocumentEditorImage | null>;
  onImageFiles?: (files: File[]) => Promise<DocumentEditorImage[]>;
  onImportImage?: (url: string) => Promise<DocumentEditorImage>;
}

/** A lazy-loaded reader/editor for the closed document format. Example: <DocumentEditor content={content} editable onChange={saveDraft} />. */
export default function DocumentEditor(props: DocumentEditorProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const assetUrl = props.assetUrl ?? assetUrlOf;
  const extensions = useMemo(() => documentExtensions(assetUrl), [assetUrl]);
  const editor = useEditor({
    extensions,
    content: props.content,
    editable: props.editable,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    onCreate: ({ editor: mounted }) => {
      if (
        JSON.stringify(documentContentFromEditor(mounted.getJSON())) !==
        JSON.stringify(props.content)
      )
        mounted.commands.setContent(props.content, { emitUpdate: false });
    },
    onUpdate: ({ editor: changedEditor }) => {
      try {
        props.onChange?.(documentContentFromEditor(changedEditor.getJSON()));
        setNotice(null);
      } catch {
        setNotice(
          'O conteúdo excede os limites permitidos. Desfaça a última alteração para salvar.',
        );
      }
    },
    editorProps: {
      handleClick: (_view, _position, event) => {
        const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
        const href = link?.getAttribute('href');
        if (props.editable || !href || !documentLinkDto.safeParse(href).success) return false;
        window.open(href, '_blank', 'noopener,noreferrer');
        return true;
      },
      attributes: {
        role: props.editable ? 'textbox' : 'document',
        'aria-label': 'Conteúdo do documento',
        'aria-multiline': 'true',
        class: 'document-prose min-h-64 select-text p-5 outline-none',
      },
      transformPastedHTML: (html) => {
        const container = new DOMParser().parseFromString(html, 'text/html');
        container
          .querySelectorAll('img,script,style,iframe,object')
          .forEach((element) => element.remove());
        return container.body.innerHTML;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length && props.onImageFiles) {
          void insertImages(() => props.onImageFiles!(files));
          return true;
        }
        const html = event.clipboardData?.getData('text/html');
        if (html && props.onImportImage) importPastedImages(html);
        return false;
      },
      handleDrop: (_view, event, _slice, moved) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (moved || !files.length || !props.onImageFiles) return false;
        void insertImages(() => props.onImageFiles!(files));
        return true;
      },
    },
  });
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(props.editable, false);
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          role: props.editable ? 'textbox' : 'document',
          'aria-label': 'Conteúdo do documento',
          'aria-multiline': 'true',
          class: 'document-prose min-h-64 select-text p-5 outline-none',
        },
      },
    });
  }, [editor, props.editable]);
  useEffect(() => {
    if (
      !editor ||
      !editor.isInitialized ||
      editor.isDestroyed ||
      JSON.stringify(documentContentFromEditor(editor.getJSON())) === JSON.stringify(props.content)
    )
      return;
    editor.commands.setContent(props.content, { emitUpdate: false });
  }, [editor, props.content]);

  async function insertImages(load: () => Promise<(DocumentEditorImage | null)[]>): Promise<void> {
    if (!editor || !editor.isEditable) return;
    const bookmark = editor.state.selection.getBookmark();
    try {
      const images = (await load()).filter((image) => image !== null);
      if (editor.isDestroyed || !editor.isEditable || !images.length) return;
      const selection = bookmark.resolve(editor.state.doc);
      editor
        .chain()
        .focus()
        .setTextSelection({ from: selection.from, to: selection.to })
        .insertContent(images.map((image) => ({ type: 'image', attrs: image })))
        .run();
    } catch {
      setNotice('Não foi possível inserir a imagem. Seu texto foi mantido.');
    }
  }

  function importPastedImages(html: string): void {
    const pasted = new DOMParser().parseFromString(html, 'text/html');
    const sources = Array.from(pasted.querySelectorAll('img[src]'))
      .map((image) => image.getAttribute('src') ?? '')
      .filter((src) => /^https?:\/\//i.test(src));
    if (sources.length)
      void insertImages(() => Promise.all(sources.map((src) => props.onImportImage!(src))));
  }

  if (!editor) return <p role="status">Carregando documento…</p>;
  return (
    <div className="document-editor-surface flex min-h-0 flex-1 flex-col">
      {props.editable && (
        <DocumentToolbar
          editor={editor}
          insertImage={
            props.onInsertImage
              ? () => {
                  void insertImages(async () => [await props.onInsertImage!()]);
                }
              : undefined
          }
        />
      )}
      {notice && (
        <p role="alert" className="px-4 py-2 text-sm text-destructive-text">
          {notice}
        </p>
      )}
      <DocumentEditorMenu editor={editor}>
        <div
          className="document-scroll min-h-0 flex-1 overflow-auto"
          onContextMenu={(event) => event.stopPropagation()}
        >
          <EditorContent editor={editor} />
        </div>
      </DocumentEditorMenu>
    </div>
  );
}
