import { LibraryBigIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { LibrarySearch, type LibraryControls } from './library-search';

export type { LibraryControls } from './library-search';

export type LibraryHeaderProps = Readonly<{
  /** The id of the "Biblioteca" heading, which names the drawer. */
  titleId: string;
  controls?: LibraryControls;
  /** The master's "Novo". */
  actions?: ReactNode;
  /** "Ampliar biblioteca" (narrow) or "Reduzir biblioteca" (wide). */
  widen?: Readonly<{ wide: boolean; toggle: () => void }>;
}>;

/** The top of the library: one line with the title, "Novo" and widen; under it the search with
 *  the filters inside. No close button: Esc, ⇧B and the tabs strip's "Biblioteca" close it.
 *
 *  Example: `<LibraryHeader titleId={titleId} controls={controls} actions={<NewItemButton … />} />` */
export function LibraryHeader({ titleId, controls, actions, widen }: LibraryHeaderProps) {
  return (
    <header className="flex shrink-0 flex-col gap-3 border-b border-border px-4 pt-3.5 pb-3">
      <div className="flex min-h-8 items-center gap-2.5">
        <LibraryBigIcon aria-hidden="true" className="size-5 shrink-0 text-primary" />
        <h2
          id={titleId}
          className="min-w-0 flex-1 truncate font-display text-[24px] leading-none font-semibold"
        >
          Biblioteca
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {widen && <WidenButton {...widen} />}
        </div>
      </div>
      {controls && <LibrarySearch {...controls} />}
    </header>
  );
}

function WidenButton({ wide, toggle }: Readonly<{ wide: boolean; toggle: () => void }>) {
  const Icon = wide ? Minimize2Icon : Maximize2Icon;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="max-md:hidden"
      aria-label={wide ? 'Reduzir biblioteca' : 'Ampliar biblioteca'}
      onClick={toggle}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
