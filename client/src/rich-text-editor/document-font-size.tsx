import type { Editor } from '@tiptap/core';
import { useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { typedFontSize } from './document-fonts';

const DEFAULT_FONT_SIZE = 16;
// The usual steps of a word processor; any other whole size in range can be typed.
const COMMON_FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72] as const;

/** Font size of the selection: type any size (Enter or leaving applies it, Escape gives up) or
 *  pick a usual one from the list.
 *
 *  Example: `<DocumentFontSize editor={editor} />` */
export function DocumentFontSize({ editor }: { editor: Editor }): React.JSX.Element {
  const current = String(
    parseInt(String(editor.getAttributes('textStyle').fontSize ?? DEFAULT_FONT_SIZE), 10),
  );
  return <FontSizeBox key={current} editor={editor} current={current} />;
}

function FontSizeBox({ editor, current }: { editor: Editor; current: string }): React.JSX.Element {
  const [typed, setTyped] = useState(current);
  const apply = (size: number): void => {
    editor.chain().focus().setFontSize(`${size}px`).run();
  };
  const commit = (): void => {
    const size = typedFontSize(typed);
    if (size === null || String(size) === current) return setTyped(current);
    apply(size);
  };
  return (
    <div className="flex h-7 items-center rounded-sm hover:bg-muted">
      <input
        aria-label="Tamanho da fonte"
        inputMode="numeric"
        className="h-7 w-8 bg-transparent pl-1.5 text-xs text-label outline-none focus-visible:outline-2 focus-visible:outline-ring"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
          if (event.key === 'Escape') {
            setTyped(current);
            editor.commands.focus();
          }
        }}
      />
      <FontSizeList onPick={apply} />
    </div>
  );
}

function FontSizeList({ onPick }: { onPick: (size: number) => void }): React.JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Tamanhos de fonte"
          className="text-muted-foreground"
        >
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="max-h-72 min-w-16"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {COMMON_FONT_SIZES.map((size) => (
          <DropdownMenuItem key={size} onSelect={() => onPick(size)}>
            {size}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
