import type { CampaignDetailDto } from '@lorkarium/contracts';
import { ArrowLeftIcon } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export type CampaignSettingsPageProps = Readonly<{
  campaign: CampaignDetailDto;
  /** The form (or the failure that took its place). */
  children: React.ReactNode;
}>;

/** The frame of "Configurações da mesa" over the play room: covers the room (which stays mounted
 *  underneath), a top bar with "Voltar à mesa" and the title, and the page scrolling below it.
 *
 *  Example: `<CampaignSettingsPage campaign={campaign}><CampaignSettingsForm … /></CampaignSettingsPage>` */
export function CampaignSettingsPage({
  campaign,
  children,
}: CampaignSettingsPageProps): React.JSX.Element {
  return (
    <div
      onKeyDown={keepKeysFromTheRoom}
      className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-background"
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-panel px-3">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link to={`/campaigns/${encodeURIComponent(campaign.id)}/table`}>
            <ArrowLeftIcon aria-hidden="true" />
            Voltar à mesa
          </Link>
        </Button>
        <h1 className="min-w-0 truncate font-display text-xl font-semibold">
          Configurações da mesa
        </h1>
        <p className="hidden min-w-0 truncate text-[13px] text-muted-foreground sm:block">
          {campaign.name}
        </p>
      </header>
      {/* `relative`: Radix's hidden inputs are absolute; without a containing block here they
          overflow the clipped page, so a focus or a section jump scrolled the page itself away. */}
      <div
        data-settings-scroller
        className="relative min-h-0 flex-1 overflow-y-auto px-4 pt-6 sm:px-8"
      >
        <div className="w-full">{children}</div>
      </div>
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
