import type { SheetSummaryDto } from '@lorkarium/contracts';
import { ArrowUpRightIcon, PanelsTopLeftIcon, ScrollTextIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  OPEN_SHEET,
  OPEN_SHEET_WINDOW,
  SHEET_VISIBILITY_LABEL,
} from '@/features/sheets/sheet-messages';

export type SheetDetailsProps = Readonly<{
  sheet: SheetSummaryDto;
  /** "Ficha · de Bia (Lyra)". */
  holderLabel: string;
  /** The template's name; `null` for a reader who does not see the templates (a player). */
  templateName: string | null;
  onOpen: () => void;
  onOpenWindow: () => void;
}>;

/** The sheet picked in the library: whose it is, its template, who sees it, and "Abrir ficha"
 *  (a room tab) / "Abrir ficha em janela". No frame here: the sheet's code runs only when opened,
 *  like a document's editor.
 *
 *  Example: `<SheetDetails sheet={sheet} holderLabel="Ficha · de Bia (Lyra)" templateName="Ficha Tormenta" onOpen={open} onOpenWindow={openWindow} />` */
export function SheetDetails(props: SheetDetailsProps): React.JSX.Element {
  const { sheet } = props;
  // A sheet nobody holds already says "só mestres".
  const meta =
    sheet.tokenId === null
      ? props.holderLabel
      : `${props.holderLabel} · ${SHEET_VISIBILITY_LABEL[sheet.visibility]}`;
  return (
    <section
      aria-label="Ficha escolhida"
      className="flex min-h-0 flex-col border-l border-border bg-panel"
    >
      <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4">
        <div className="min-w-0">
          <p className="mb-2 text-[10px] tracking-[.16em] text-muted-foreground uppercase">Ficha</p>
          <h3 className="truncate font-display text-2xl">{sheet.name}</h3>
        </div>
        <ScrollTextIcon aria-hidden className="mt-1 size-5 shrink-0 text-primary/70" />
      </div>
      <p className="px-6 text-xs text-muted-foreground">{meta}</p>
      {props.templateName !== null && (
        <p className="px-6 pt-1 text-xs text-muted-foreground">{`Modelo · ${props.templateName}`}</p>
      )}
      <div className="mt-auto flex flex-col gap-2 border-t border-border p-5">
        <Button onClick={props.onOpen}>
          <ArrowUpRightIcon aria-hidden />
          {OPEN_SHEET}
        </Button>
        <Button variant="outline" onClick={props.onOpenWindow}>
          <PanelsTopLeftIcon aria-hidden />
          {OPEN_SHEET_WINDOW}
        </Button>
      </div>
    </section>
  );
}
