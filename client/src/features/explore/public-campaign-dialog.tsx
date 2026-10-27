import type { PublicCampaignDto } from '@lorkarium/contracts';
import { LockIcon, XIcon } from 'lucide-react';
import { CampaignCover } from '@/components/campaign-cover';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CampaignAbout, CampaignLabels } from '@/features/campaigns/campaign-description-blocks';
import { visibilityLabel } from '@/features/campaigns/campaign-detail-dialog';
import { campaignMeta } from '@/lib/campaign-meta';
import type { CampaignsFailure } from '@/services/campaigns-api';
import { publicJoinFailureMessage } from './explore-messages';

export type PublicCampaignDialogProps = Readonly<{
  campaign: PublicCampaignDto;
  submitting: boolean;
  /** A refused join that is not about the password (that one has its own dialog). */
  failure: CampaignsFailure | null;
  onEnter: () => void;
  onClose: () => void;
}>;

/** "Detalhes" of a campaign the reader is not in yet: what the list already knows (cover, name,
 *  status, system, master, description, warnings, tags), then "Fechar" and "Entrar".
 *
 *  Example: `{open && <PublicCampaignDialog campaign={c} submitting={busy} failure={null} onEnter={join} onClose={close} />}` */
export function PublicCampaignDialog(props: PublicCampaignDialogProps): React.JSX.Element {
  const { campaign } = props;
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90svh] gap-5 overflow-y-auto sm:max-w-2xl"
      >
        <PublicCampaignHeader campaign={campaign} onClose={props.onClose} />
        {campaign.description && <CampaignAbout description={campaign.description} />}
        <CampaignLabels campaign={campaign} />
        {props.failure && (
          <p role="alert" className="text-sm text-destructive">
            {publicJoinFailureMessage(props.failure)}
          </p>
        )}
        <DialogFooterButtons {...props} />
      </DialogContent>
    </Dialog>
  );
}

type PublicCampaignHeaderProps = Readonly<{ campaign: PublicCampaignDto; onClose: () => void }>;

function PublicCampaignHeader({ campaign, onClose }: PublicCampaignHeaderProps): React.JSX.Element {
  return (
    <div className="flex items-start gap-4 sm:gap-5">
      <CampaignCover
        cover={campaign.cover}
        className="size-20 shrink-0 border border-divider sm:size-24"
      />
      <DialogHeader className="min-w-0 flex-1 gap-1.5">
        <p className="inline-flex items-center gap-1.5 text-xs text-label">
          {(campaign.hasPassword || campaign.visibility === 'private') && (
            <LockIcon aria-hidden="true" className="size-3" />
          )}
          {visibilityLabel(campaign)}
        </p>
        <DialogTitle className="break-words">{campaign.name}</DialogTitle>
        <StatusBadge status={campaign.status} />
        <DialogDescription>{campaignMeta(campaign)}</DialogDescription>
      </DialogHeader>
      <Button variant="ghost" size="icon-sm" aria-label="Fechar detalhes" onClick={onClose}>
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

function DialogFooterButtons(props: PublicCampaignDialogProps): React.JSX.Element {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" size="lg" onClick={props.onClose}>
        Fechar
      </Button>
      <Button
        type="button"
        size="lg"
        onClick={props.onEnter}
        disabled={props.submitting}
        aria-busy={props.submitting}
      >
        {props.submitting ? 'Entrando…' : 'Entrar'}
      </Button>
    </div>
  );
}
