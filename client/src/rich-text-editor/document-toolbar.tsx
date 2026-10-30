import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  AlignLeftIcon,
  BoldIcon,
  ChevronDownIcon,
  Columns3Icon,
  ImagePlusIcon,
  IndentDecreaseIcon,
  IndentIncreaseIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  QuoteIcon,
  Redo2Icon,
  Rows3Icon,
  StrikethroughIcon,
  Table2Icon,
  Trash2Icon,
  UnderlineIcon,
  Undo2Icon,
  type LucideIcon,
} from 'lucide-react';
import { documentLinkDto } from '@lorkarium/contracts';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { captureDocumentSelection } from './document-selection';
import { DocumentFontSize } from './document-font-size';
import { DocumentFontPicker } from './document-font-picker';
import { ToolbarMenuSelect, type ToolbarMenuOption } from './toolbar-menu-select';

type ToolbarActionProps = {
  label: string;
  icon: LucideIcon;
  run: () => void;
  active?: boolean;
  disabled?: boolean;
};
function ToolbarAction({
  label,
  icon: Icon,
  run,
  active,
  disabled,
}: ToolbarActionProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          className="text-muted-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary"
          onMouseDown={(event) => event.preventDefault()}
          onClick={run}
        >
          <Icon aria-hidden="true" className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
function ToolbarDivider(): React.JSX.Element {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-divider" />;
}
const BLOCK_STYLES: readonly ToolbarMenuOption[] = [
  { value: 'paragraph', label: 'Texto normal' },
  { value: '1', label: 'Título 1' },
  { value: '2', label: 'Título 2' },
  { value: '3', label: 'Título 3' },
];
const ALIGNMENTS: readonly ToolbarMenuOption[] = [
  { value: 'left', label: 'À esquerda' },
  { value: 'center', label: 'Centralizado' },
  { value: 'right', label: 'À direita' },
  { value: 'justify', label: 'Justificado' },
];

/** Compact controls retain the editor selection across floating menus. Example: <DocumentToolbar editor={editor} />. */
export function DocumentToolbar({
  editor,
  insertImage,
}: {
  editor: Editor;
  insertImage?: () => void;
}): React.JSX.Element {
  useEditorState({ editor, selector: ({ editor: current }) => current.state });
  const command =
    (run: () => void): (() => void) =>
    () => {
      editor.commands.focus();
      run();
    };
  return (
    <TooltipProvider delayDuration={450}>
      <div
        role="toolbar"
        aria-label="Formatação do documento"
        onPointerDownCapture={() => captureDocumentSelection(editor)}
        onFocusCapture={() => captureDocumentSelection(editor)}
        className="document-toolbar flex shrink-0 flex-wrap items-center justify-center gap-0.5 border-b border-divider bg-panel px-3 py-2"
      >
        <ToolbarAction
          label="Desfazer"
          icon={Undo2Icon}
          run={() => {
            editor.chain().focus().undo().run();
          }}
          disabled={!editor.can().undo()}
        />
        <ToolbarAction
          label="Refazer"
          icon={Redo2Icon}
          run={() => {
            editor.chain().focus().redo().run();
          }}
          disabled={!editor.can().redo()}
        />
        <ToolbarDivider />
        <ToolbarMenuSelect
          label="Estilo do parágrafo"
          className="w-28"
          value={String(editor.getAttributes('heading').level ?? 'paragraph')}
          options={BLOCK_STYLES}
          onChoose={(value) => {
            if (value === 'paragraph') editor.chain().focus().setParagraph().run();
            else
              editor
                .chain()
                .focus()
                .setHeading({ level: Number(value) as 1 | 2 | 3 })
                .run();
          }}
        />
        <DocumentFontPicker editor={editor} />
        <DocumentFontSize editor={editor} />
        <ToolbarDivider />
        <ToolbarAction
          label="Negrito"
          icon={BoldIcon}
          run={() => {
            editor.chain().focus().toggleBold().run();
          }}
          active={editor.isActive('bold')}
        />
        <ToolbarAction
          label="Itálico"
          icon={ItalicIcon}
          run={() => {
            editor.chain().focus().toggleItalic().run();
          }}
          active={editor.isActive('italic')}
        />
        <ToolbarAction
          label="Sublinhado"
          icon={UnderlineIcon}
          run={() => {
            editor.chain().focus().toggleUnderline().run();
          }}
          active={editor.isActive('underline')}
        />
        <ToolbarAction
          label="Tachado"
          icon={StrikethroughIcon}
          run={() => {
            editor.chain().focus().toggleStrike().run();
          }}
          active={editor.isActive('strike')}
        />
        <TextColor editor={editor} />
        <ToolbarDivider />
        <ParagraphSettings editor={editor} />
        <LineHeightSelect editor={editor} />
        <ToolbarAction
          label="Lista com marcadores"
          icon={ListIcon}
          run={() => {
            editor.chain().focus().toggleBulletList().run();
          }}
          active={editor.isActive('bulletList')}
        />
        <ToolbarAction
          label="Lista numerada"
          icon={ListOrderedIcon}
          run={() => {
            editor.chain().focus().toggleOrderedList().run();
          }}
          active={editor.isActive('orderedList')}
        />
        <ToolbarDivider />
        <ToolbarAction
          label="Link"
          icon={LinkIcon}
          run={() => editLink(editor)}
          active={editor.isActive('link')}
        />
        <ToolbarAction
          label="Inserir imagem"
          icon={ImagePlusIcon}
          run={() => insertImage?.()}
          disabled={!insertImage}
        />
        <ToolbarAction
          label="Inserir tabela"
          icon={Table2Icon}
          run={() => {
            editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
          }}
          disabled={editor.isActive('table')}
        />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Mais opções de formatação"
              type="button"
              variant="ghost"
              size="icon-sm"
            >
              <ChevronDownIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              refocusEditor(editor);
            }}
          >
            <DropdownMenuItem
              onSelect={command(() => {
                editor.chain().focus().toggleBlockquote().run();
              })}
            >
              <QuoteIcon />
              Citação
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={command(() => {
                editor.chain().focus().setHorizontalRule().run();
              })}
            >
              <MinusIcon />
              Separador
            </DropdownMenuItem>
            {editor.isActive('table') && <TableActions editor={editor} />}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
}

// A floating menu can finish closing after the editor is gone (unmount, revoked access).
function refocusEditor(editor: Editor): void {
  if (!editor.isDestroyed) editor.commands.focus();
}
function editLink(editor: Editor): void {
  const href = window.prompt('Endereço do link', String(editor.getAttributes('link').href ?? ''));
  if (href === '') editor.chain().focus().unsetLink().run();
  else if (href && documentLinkDto.safeParse(href).success)
    editor.chain().focus().setLink({ href }).run();
}
function TextColor({ editor }: { editor: Editor }): React.JSX.Element {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Opções de cor do texto">
          <span
            className="border-b-2 text-sm font-semibold"
            style={{
              borderColor: String(editor.getAttributes('textStyle').color ?? 'var(--foreground)'),
            }}
          >
            A
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-48 p-3"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          refocusEditor(editor);
        }}
      >
        <label className="flex items-center justify-between gap-4 text-xs">
          Cor do texto
          <input
            aria-label="Cor do texto"
            type="color"
            className="h-8 w-10 rounded-sm border border-input bg-card"
            value={String(editor.getAttributes('textStyle').color ?? '#eae5da')}
            onChange={(event) => {
              editor.chain().focus().setColor(event.target.value).run();
            }}
          />
        </label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            editor.chain().focus().unsetColor().run();
          }}
        >
          Cor padrão
        </Button>
      </PopoverContent>
    </Popover>
  );
}
// Matches the `.document-prose` line-height, so a block without its own value reads as this one.
const DEFAULT_LINE_HEIGHT = 1.15;
const LINE_HEIGHTS: readonly ToolbarMenuOption[] = [1, 1.15, 1.5, 2].map((height) => ({
  value: String(height),
  label: String(height).replace('.', ','),
}));

function LineHeightSelect({ editor }: { editor: Editor }): React.JSX.Element {
  const block = editor.isActive('heading') ? 'heading' : 'paragraph';
  return (
    <ToolbarMenuSelect
      label="Entrelinha"
      className="w-16"
      value={String(editor.getAttributes(block).lineHeight ?? DEFAULT_LINE_HEIGHT)}
      options={LINE_HEIGHTS}
      onChoose={(value) => {
        editor
          .chain()
          .focus()
          .updateAttributes(block, { lineHeight: Number(value) })
          .run();
      }}
    />
  );
}
function ParagraphSettings({ editor }: { editor: Editor }): React.JSX.Element {
  const block = editor.isActive('heading') ? 'heading' : 'paragraph';
  const indent = Number(editor.getAttributes(block).indent ?? 0);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Opções de parágrafo">
          <AlignLeftIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 gap-4 p-4"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          refocusEditor(editor);
        }}
      >
        <div className="flex items-center justify-between gap-4 text-xs">
          <span>Alinhamento</span>
          <ToolbarMenuSelect
            label="Alinhamento"
            className="w-28"
            value={String(editor.getAttributes(block).textAlign ?? 'left')}
            options={ALIGNMENTS}
            onChoose={(value) => {
              editor.chain().focus().setTextAlign(value).run();
            }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span>Recuo</span>
          <div className="flex items-center gap-2">
            <ToolbarAction
              label="Diminuir recuo"
              icon={IndentDecreaseIcon}
              disabled={indent === 0}
              run={() => {
                editor
                  .chain()
                  .focus()
                  .updateAttributes(block, { indent: Math.max(0, indent - 1) })
                  .run();
              }}
            />
            <span className="w-4 text-center tabular-nums">{indent}</span>
            <ToolbarAction
              label="Aumentar recuo"
              icon={IndentIncreaseIcon}
              disabled={indent === 6}
              run={() => {
                editor
                  .chain()
                  .focus()
                  .updateAttributes(block, { indent: Math.min(6, indent + 1) })
                  .run();
              }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
function TableActions({ editor }: { editor: Editor }): React.JSX.Element {
  return (
    <>
      <DropdownMenuItem
        onSelect={() => {
          editor.chain().focus().addRowAfter().run();
        }}
      >
        <Rows3Icon />
        Adicionar linha
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          editor.chain().focus().addColumnAfter().run();
        }}
      >
        <Columns3Icon />
        Adicionar coluna
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          editor.chain().focus().deleteRow().run();
        }}
      >
        Excluir linha
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          editor.chain().focus().deleteColumn().run();
        }}
      >
        Excluir coluna
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          editor.chain().focus().toggleHeaderRow().run();
        }}
      >
        Alternar cabeçalho
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        onSelect={() => {
          editor.chain().focus().deleteTable().run();
        }}
      >
        <Trash2Icon />
        Excluir tabela
      </DropdownMenuItem>
    </>
  );
}
