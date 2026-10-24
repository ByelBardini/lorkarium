import { ArrowLeftIcon } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export type RoomCoverPageProps = Readonly<{
  campaignId: string;
  campaignName: string;
  /** The page's `h1`, e.g. "Configurações da mesa". */
  title: string;
  /** Below the bar, filling what is left of the screen (it scrolls on its own). */
  children: React.ReactNode;
}>;

/** A page of the play room drawn over it (the room stays mounted underneath, so the table stays
 *  open): a 48px bar with "Voltar à mesa", the title and the table's name, and the page below.
 *
 *  Example: `<RoomCoverPage campaignId={id} campaignName={name} title="Condições da mesa">…</RoomCoverPage>` */
export function RoomCoverPage(props: RoomCoverPageProps): React.JSX.Element {
  return (
    <div
      onKeyDown={keepKeysFromTheRoom}
      className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-background"
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-panel px-3">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link to={`/campaigns/${encodeURIComponent(props.campaignId)}/table`}>
            <ArrowLeftIcon aria-hidden="true" />
            Voltar à mesa
          </Link>
        </Button>
        <h1 className="min-w-0 truncate font-display text-xl font-semibold">{props.title}</h1>
        <p className="hidden min-w-0 truncate text-[13px] text-muted-foreground sm:block">
          {props.campaignName}
        </p>
      </header>
      {props.children}
    </div>
  );
}

// The room listens on `window` for its keys (F, V, Delete, Ctrl+Z…): typed here, they would act
// on the hidden board. Keys from a dialog (portaled outside) are left alone; the room skips them.
function keepKeysFromTheRoom(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.target instanceof Node && event.currentTarget.contains(event.target)) {
    event.stopPropagation();
  }
}
