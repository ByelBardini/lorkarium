import type { CampaignDetailDto, CampaignMemberDto } from '@lorkarium/contracts';
import { useId } from 'react';
import { useNavigate, useRouteError } from 'react-router';
import { ApiLoadError } from '@/app/shell/api-loader';
import { CopyCodeButton } from '@/components/copy-code-button';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCampaignCode } from '@/lib/campaign-code';
import { campaignMeta, ROLE_LABEL } from '@/lib/campaign-meta';
import type { Clipboard } from '@/services/clipboard';
import { failureMessage } from './campaign-messages';
import { EnterCampaignButton } from './enter-campaign-button';

export type CampaignDetailDialogProps = Readonly<{
  campaign: CampaignDetailDto;
  clipboard: Clipboard;
  onClose: () => void;
}>;

/** The campaign in a modal: who you are in it, what it is, who plays, the code (master only),
 *  and "Entrar na mesa".
 *
 *  Example: `<CampaignDetailDialog campaign={campaign} clipboard={clipboard} onClose={back} />` */
export function CampaignDetailDialog({
  campaign,
  clipboard,
  onClose,
}: CampaignDetailDialogProps): React.JSX.Element {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <title>{`Lorkarium · ${campaign.name}`}</title>
        <DialogHeader>
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            {campaign.myRole === 'master' ? 'Você mestra' : 'Você joga'}
          </p>
          <DialogTitle>{campaign.name}</DialogTitle>
          <DialogDescription>{campaignMeta(campaign)}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-label">{visibilityLabel(campaign)}</p>
        {campaign.description && (
          <p className="text-[15px] leading-relaxed text-foreground">{campaign.description}</p>
        )}
        {campaign.joinCode && <JoinCodeBlock code={campaign.joinCode} clipboard={clipboard} />}
        <MemberList members={campaign.members} />
        <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-start sm:justify-between">
          <Button variant="outline" size="lg" onClick={onClose}>
            Fechar
          </Button>
          <EnterCampaignButton campaignId={campaign.id} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function visibilityLabel(campaign: CampaignDetailDto): string {
  const visibility = campaign.visibility === 'public' ? 'Pública' : 'Privada';
  return campaign.hasPassword ? `${visibility} · com senha` : visibility;
}

type JoinCodeBlockProps = Readonly<{ code: string; clipboard: Clipboard }>;

function JoinCodeBlock({ code, clipboard }: JoinCodeBlockProps): React.JSX.Element {
  const formatted = formatCampaignCode(code);
  return (
    <div className="flex flex-col gap-2 border-y border-border py-4">
      <span className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        Código da mesa
      </span>
      <span className="font-brand text-2xl tracking-[0.2em] text-primary">{formatted}</span>
      <CopyCodeButton code={formatted} clipboard={clipboard} />
    </div>
  );
}

function MemberList({ members }: Readonly<{ members: readonly CampaignMemberDto[] }>) {
  const titleId = useId();
  return (
    <section className="flex flex-col gap-2">
      <h3 id={titleId} className="text-[13px] font-semibold text-label">
        Participantes ({members.length})
      </h3>
      <ul aria-labelledby={titleId}>
        {members.map((member) => (
          <li
            key={member.userId}
            className="flex items-center gap-3 border-b border-divider py-2 last:border-b-0"
          >
            {/* Reserved for the online indicator, which arrives with real time (spec §11, phase 2). */}
            <span aria-hidden="true" className="size-2 shrink-0" />
            <UserAvatar
              name={member.name}
              color={member.color}
              avatarId={member.avatarId}
              size="sm"
            />
            <span className="flex-1 truncate text-sm">{member.name}</span>
            <span className="text-xs tracking-[0.12em] text-muted-foreground uppercase">
              {ROLE_LABEL[member.role]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
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
