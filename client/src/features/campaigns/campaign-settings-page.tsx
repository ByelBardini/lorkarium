import type { CampaignDetailDto } from '@lorkarium/contracts';
import { RoomCoverPage } from '@/components/room-cover-page';

export type CampaignSettingsPageProps = Readonly<{
  campaign: CampaignDetailDto;
  /** The save controls, in the top bar. */
  actions?: React.ReactNode;
  /** The form (or the failure that took its place). */
  children: React.ReactNode;
}>;

/** The frame of "Configurações da mesa" over the play room: covers the room (which stays mounted
 *  underneath), a top bar with "Voltar à mesa", the title and the save controls, and the page
 *  below it in columns (menu, the scrolling form, the preview).
 *
 *  Example: `<CampaignSettingsPage campaign={campaign} actions={<SettingsSaveActions … />}>…</CampaignSettingsPage>` */
export function CampaignSettingsPage({
  campaign,
  actions,
  children,
}: CampaignSettingsPageProps): React.JSX.Element {
  return (
    <RoomCoverPage
      campaignId={campaign.id}
      campaignName={campaign.name}
      title="Configurações da mesa"
      actions={actions}
    >
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">{children}</div>
    </RoomCoverPage>
  );
}
