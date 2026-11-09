import type { FormEvent } from 'react';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { DOCUMENT_IMAGE_MAX_WIDTH, DOCUMENT_IMAGE_MIN_WIDTH } from '@lorkarium/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToolbarMenuSelect } from './toolbar-menu-select';

const IMAGE_ALIGNMENTS = [
  { value: 'left', label: 'À esquerda' },
  { value: 'center', label: 'Centralizado' },
  { value: 'right', label: 'À direita' },
] as const;

/** Edits the selected image in place. Example: `<DocumentImageControls editor={editor} />`. */
export function DocumentImageControls({ editor }: { editor: Editor }): React.JSX.Element | null {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return null;

  const { width, align } = selection.node.attrs;
  const apply = (attributes: { width: number | null } | { align: string }): void => {
    if (editor.isDestroyed || !editor.isEditable || !editor.state.selection.eq(selection)) return;
    editor
      .chain()
      .updateAttributes('image', attributes)
      .setNodeSelection(selection.from)
      .focus()
      .run();
  };
  return (
    <div className="flex items-center gap-1 border-l border-divider pl-1">
      <ImageWidth
        key={`${selection.from}:${width}`}
        width={width}
        apply={(width) => apply({ width })}
      />
      <ToolbarMenuSelect
        label="Alinhamento da imagem"
        value={align ?? 'left'}
        options={IMAGE_ALIGNMENTS}
        onChoose={(align) => apply({ align })}
      />
    </div>
  );
}

function ImageWidth({
  width,
  apply,
}: {
  width: number | null;
  apply: (width: number | null) => void;
}): React.JSX.Element {
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('width');
    const next = value === '' ? null : Number(value);
    if (next !== width) apply(next);
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <Input
        type="number"
        name="width"
        aria-label="Largura da imagem em pixels"
        title="Deixe em branco para usar o tamanho original"
        placeholder="Original"
        defaultValue={width ?? ''}
        min={DOCUMENT_IMAGE_MIN_WIDTH}
        max={DOCUMENT_IMAGE_MAX_WIDTH}
        className="h-7 w-20 rounded-sm px-1.5 text-xs"
      />
      <span aria-hidden="true" className="text-xs text-muted-foreground">
        px
      </span>
      <Button type="submit" variant="ghost" size="sm" aria-label="Aplicar largura da imagem">
        Aplicar
      </Button>
    </form>
  );
}
