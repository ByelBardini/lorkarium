import type { CampaignDetailDto, CampaignMemberDto } from '@lorkarium/contracts';
import { LockIcon, XIcon } from 'lucide-react';
import { useNavigate, useRouteError } from 'react-router';
import { ApiLoadError } from '@/app/shell/api-loader';
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
import { campaignMeta } from '@/lib/campaign-meta';
import { failureMessage } from './campaign-messages';

export type CampaignDetailDialogProps = Readonly<{
  campaign: CampaignDetailDto;
  onClose: () => void;
  /** The body under the header: the overview. */
  children: React.ReactNode;
}>;

/** The campaign in a modal: cover, who you are in it, name, status and who is online, then the
 *  overview. The settings live in the play room (`/campaigns/:id/table/settings`), not here.
 *
 *  Example: `<CampaignDetailDialog campaign={campaign} onClose={back}><CampaignOverview … /></CampaignDetailDialog>` */
export function CampaignDetailDialog({
  campaign,
  onClose,
  children,
}: CampaignDetailDialogProps): React.JSX.Element {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90svh] gap-5 overflow-y-auto sm:max-w-3xl"
      >
        <title>{`Lorkarium · ${campaign.name}`}</title>
        <DetailHeader campaign={campaign} onClose={onClose} />
        {children}
      </DialogContent>
    </Dialog>
  );
}

type DetailHeaderProps = Readonly<{ campaign: CampaignDetailDto; onClose: () => void }>;

const ROLE_HEADLINE: Readonly<Record<CampaignDetailDto['myRole'], string>> = {
  master: 'Você mestra',
  player: 'Você joga',
  spectator: 'Você assiste',
};

function DetailHeader({ campaign, onClose }: DetailHeaderProps): React.JSX.Element {
  const online = onlineSummary(campaign.members);
  return (
    <div className="flex items-start gap-4 sm:gap-5">
      <CampaignCover
        cover={campaign.cover}
        className="size-20 shrink-0 border border-divider sm:size-28"
      />
      <DialogHeader className="min-w-0 flex-1 gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            {ROLE_HEADLINE[campaign.myRole]}
          </p>
          <p className="inline-flex items-center gap-1.5 text-xs text-label">
            {campaign.hasPassword && <LockIcon aria-hidden="true" className="size-3" />}
            {visibilityLabel(campaign)}
          </p>
        </div>
        <DialogTitle className="break-words">{campaign.name}</DialogTitle>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusBadge status={campaign.status} />
          {online && <p className="text-[13px] text-muted-foreground">{online}</p>}
        </div>
        <DialogDescription>{campaignMeta(campaign)}</DialogDescription>
      </DialogHeader>
      <Button variant="ghost" size="icon-sm" aria-label="Fechar detalhes" onClick={onClose}>
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

/** "Pública" or "Privada", with " · com senha" when joining asks for it.
 *
 *  Example: `visibilityLabel({ visibility: 'private', hasPassword: true }) // 'Privada · com senha'` */
export function visibilityLabel(
  campaign: Pick<CampaignDetailDto, 'visibility' | 'hasPassword'>,
): string {
  const visibility = campaign.visibility === 'public' ? 'Pública' : 'Privada';
  return campaign.hasPassword ? `${visibility} · com senha` : visibility;
}

// Nobody online says nothing: the normal state does not announce itself.
function onlineSummary(members: readonly CampaignMemberDto[]): string | null {
  const onlineCount = members.filter((member) => member.online).length;
  if (onlineCount === 0) return null;
  const count = `${onlineCount} de ${members.length} online agora`;
  const masterOnline = members.some((member) => member.role === 'master' && member.online);
  return masterOnline ? `Mestre online · ${count}` : count;
}

/** The detail modal when the campaign could not load: not a member, offline or broken.
 *  Closing goes back to the list.
 *
 *  Example: `{ path: 'campaigns/:campaignId', ErrorBoundary: CampaignDetailErrorRoute }` */
export function CampaignDetailErrorRoute(): React.JSX.Element {
  const navigate = useNavigate();
  const onClose = (): void => void navigate('/');
  const error = useRouteError();
  const kind = error instanceof ApiLoadError ? error.kind : 'unexpected';
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kind === 'not_found' ? 'Mesa não encontrada' : 'Não deu para abrir a mesa'}
          </DialogTitle>
          <DialogDescription>{failureMessage(kind)}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button variant="outline" size="lg" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
