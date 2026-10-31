import type { ReactNode } from 'react';
import { LockKeyholeIcon, PanelTopIcon, ScrollTextIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Says under the template's name whose code the frame runs: the table's master, not the app. */
export const SHEET_AUTHOR_LINE = 'Ficha da mesa · código do mestre';
export const SHEET_READ_ONLY = 'Somente leitura';

export type SheetFrameChromeProps = Readonly<{
  /** "Ficha · Lyra": the name of the region. */
  title: string;
  /** The template's name; `null` while the sheet loads. */
  templateName: string | null;
  canEdit: boolean;
  /** In its own window: one tight line (the window's bar has the title). */
  compact?: boolean;
  onOpenWindow?: () => void;
  onClose?: () => void;
  /** More in the header, before the window buttons (the master's console). */
  tools?: ReactNode;
  children: ReactNode;
}>;

/** The app's frame around a sheet, so the player tells the master's code from the app: the
 *  template's name, "Ficha da mesa · código do mestre", the "Somente leitura" mark when the
 *  viewer may not edit, and the window and close buttons.
 *
 *  Example: `<SheetFrameChrome title="Ficha · Lyra" templateName="Ficha Tormenta" canEdit={false}>{frame}</SheetFrameChrome>` */
export function SheetFrameChrome(props: SheetFrameChromeProps): React.JSX.Element {
  return (
    <section aria-label={props.title} className="flex min-h-0 flex-1 flex-col bg-background">
      <header
        className={cn(
          'flex items-center gap-3 border-b border-divider',
          props.compact ? 'px-4 py-1.5' : 'px-5 py-3',
        )}
      >
        <ScrollTextIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium text-foreground">
            {props.templateName ?? 'Ficha'}
          </h2>
          <p className="truncate text-xs text-muted-foreground">{SHEET_AUTHOR_LINE}</p>
        </div>
        {props.tools}
        {!props.canEdit && <ReadOnlyMark />}
        <ChromeButtons onOpenWindow={props.onOpenWindow} onClose={props.onClose} />
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col">{props.children}</div>
    </section>
  );
}

function ReadOnlyMark(): React.JSX.Element {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-sm border border-divider px-2 py-0.5 text-xs text-muted-foreground">
      <LockKeyholeIcon aria-hidden="true" className="size-3" />
      {SHEET_READ_ONLY}
    </span>
  );
}

function ChromeButtons({
  onOpenWindow,
  onClose,
}: Pick<SheetFrameChromeProps, 'onOpenWindow' | 'onClose'>): React.JSX.Element {
  return (
    <>
      {onOpenWindow && (
        <Button
          aria-label="Abrir ficha em janela"
          title="Abrir em janela separada"
          variant="ghost"
          size="icon-sm"
          onClick={onOpenWindow}
        >
          <PanelTopIcon aria-hidden="true" />
        </Button>
      )}
      {onClose && (
        <Button
          aria-label="Fechar ficha"
          title="Fechar ficha"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
        >
          <XIcon aria-hidden="true" />
        </Button>
      )}
    </>
  );
}
