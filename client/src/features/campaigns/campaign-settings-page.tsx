import type { CampaignDetailDto } from '@lorkarium/contracts';
import { RoomCoverPage } from '@/components/room-cover-page';

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
    <RoomCoverPage
      campaignId={campaign.id}
      campaignName={campaign.name}
      title="Configurações da mesa"
    >
      {/* `relative`: Radix's hidden inputs are absolute; without a containing block here they
          overflow the clipped page, so a focus or a section jump scrolled the page itself away. */}
      <div
        data-settings-scroller
        className="relative min-h-0 flex-1 overflow-y-auto px-4 pt-6 sm:px-8"
      >
        <div className="w-full">{children}</div>
      </div>
    </RoomCoverPage>
  );
}
