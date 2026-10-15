import type { CampaignSummaryDto } from '@lorkarium/contracts';
import { useNavigate } from 'react-router';
import type { Clipboard } from '@/services/clipboard';
import { CreateCampaignDialog } from './create-campaign-dialog';
import { JoinCampaignDialog } from './join-campaign-dialog';

export type HomeDialog = 'create' | 'join' | null;

export type HomeDialogsProps = Readonly<{
  dialog: HomeDialog;
  clipboard: Clipboard;
  onClose: () => void;
}>;

/** The "Nova mesa" and "Entrar numa mesa" dialogs of the home; only one opens at a time.
 *  Joining closes the dialog and opens the detail of the campaign joined.
 *
 *  Example: `<HomeDialogs dialog={dialog} clipboard={clipboard} onClose={() => setDialog(null)} />` */
export function HomeDialogs({
  dialog,
  clipboard,
  onClose,
}: HomeDialogsProps): React.JSX.Element | null {
  const navigate = useNavigate();
  const openJoined = (campaign: CampaignSummaryDto): void => {
    onClose();
    void navigate(`/campaigns/${campaign.id}`);
  };
  if (dialog === 'create') return <CreateCampaignDialog clipboard={clipboard} onClose={onClose} />;
  if (dialog === 'join') return <JoinCampaignDialog onClose={onClose} onJoined={openJoined} />;
  return null;
}
