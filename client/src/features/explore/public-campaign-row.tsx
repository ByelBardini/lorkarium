import type { PublicCampaignDto } from '@lorkarium/contracts';
import { EyeOffIcon, LockIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useFetcher } from 'react-router';
import { CampaignCover } from '@/components/campaign-cover';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { campaignMeta, ROLE_LABEL } from '@/lib/campaign-meta';
import type { ExploreActionRequest, ExploreActionResult } from './explore-action';
import { PASSWORD_FAILURES, publicJoinFailureMessage } from './explore-messages';
import { JoinPublicDialog } from './join-public-dialog';
import { PublicCampaignDialog } from './public-campaign-dialog';

export type PublicCampaignRowProps = Readonly<{ campaign: PublicCampaignDto }>;

/** One card of "Explorar mesas": cover, status, name, meta and, in the footer, "Detalhes"
 *  (the modal with "Entrar", asking the password first when it has one, or the full detail of the
 *  campaign for one the reader is in).
 *
 *  Example: `<ul>{campaigns.map((c) => <PublicCampaignRow key={c.id} campaign={c} />)}</ul>` */
export function PublicCampaignRow({ campaign }: PublicCampaignRowProps): React.JSX.Element {
  const join = usePublicJoin(campaign);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const closeDetails = (): void => {
    setDetailsOpen(false);
    join.close();
  };
  return (
    <li className="flex flex-col overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-primary/40">
      <CampaignCover cover={campaign.cover} className="aspect-[300/140] w-full" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <CampaignText campaign={campaign} />
        <RowAction campaign={campaign} onDetails={() => setDetailsOpen(true)} />
      </div>
      {join.rowFailure && !detailsOpen && (
        <p role="alert" className="px-4 pb-4 text-sm text-destructive">
          {publicJoinFailureMessage(join.rowFailure)}
        </p>
      )}
      {detailsOpen && <RowDialogs campaign={campaign} join={join} onClose={closeDetails} />}
    </li>
  );
}

type RowDialogsProps = PublicCampaignRowProps & Readonly<{ join: PublicJoin; onClose: () => void }>;

// The password dialog stands in for the details while it is open; cancelling it comes back here.
function RowDialogs({ campaign, join, onClose }: RowDialogsProps): React.JSX.Element {
  if (join.asking) {
    return (
      <JoinPublicDialog
        campaignName={campaign.name}
        submitting={join.submitting}
        failure={join.failure}
        onSubmit={join.send}
        onClose={join.close}
      />
    );
  }
  return (
    <PublicCampaignDialog
      campaign={campaign}
      submitting={join.submitting}
      failure={join.rowFailure}
      onEnter={join.start}
      onClose={onClose}
    />
  );
}

type PublicJoin = ReturnType<typeof usePublicJoin>;

// The dialog opens for a protected campaign, and also when the master added a password since the
// list loaded (the server asks for it).
function usePublicJoin(campaign: PublicCampaignDto) {
  const fetcher = useFetcher<ExploreActionResult>({ key: `explore-join-${campaign.id}` });
  const [opened, setOpened] = useState(false);
  const submitting = fetcher.state !== 'idle';
  const failure = !submitting && fetcher.data ? fetcher.data.failure : null;
  const asksPassword = failure !== null && PASSWORD_FAILURES.has(failure.kind);
  const asking = opened || asksPassword;
  const send = (password?: string): void => {
    const body: ExploreActionRequest = {
      campaignId: campaign.id,
      input: password ? { password } : {},
    };
    void fetcher.submit(body, { method: 'post', encType: 'application/json' });
  };
  const start = (): void => (campaign.hasPassword ? setOpened(true) : send());
  const close = (): void => {
    setOpened(false);
    fetcher.reset();
  };
  const rowFailure = asking ? null : failure;
  return { submitting, failure, asking, rowFailure, send, start, close };
}

function CampaignText({ campaign }: PublicCampaignRowProps): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <StatusBadge status={campaign.status} />
      <span className="truncate font-display text-[22px] leading-tight font-semibold">
        {campaign.name}
      </span>
      <span className="truncate text-[13px] text-muted-foreground">{campaignMeta(campaign)}</span>
      <PresenceLine campaign={campaign} />
      {campaign.description && (
        <span className="line-clamp-2 text-[13px] text-placeholder">{campaign.description}</span>
      )}
    </div>
  );
}

// Said in words beside the dot, so the green is never the only cue.
function PresenceLine({ campaign }: PublicCampaignRowProps): React.JSX.Element | null {
  const parts = [
    campaign.masterOnline ? 'Mestre online' : null,
    campaign.playersOnline > 0 ? playersOnlineLabel(campaign.playersOnline) : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-chart-4">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {parts.join(' · ')}
    </span>
  );
}

function playersOnlineLabel(count: number): string {
  return count === 1 ? '1 jogador online' : `${count} jogadores online`;
}

type RowActionProps = PublicCampaignRowProps & Readonly<{ onDetails: () => void }>;

function RowAction({ campaign, onDetails }: RowActionProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 border-t border-divider pt-3">
      <CampaignFlags campaign={campaign} />
      {campaign.myRole && (
        <span className="text-xs font-semibold tracking-[0.12em] text-label uppercase">
          {ROLE_LABEL[campaign.myRole]}
        </span>
      )}
      <DetailsButton campaign={campaign} onDetails={onDetails} />
    </div>
  );
}

// One the reader is in has the full detail (members, last visit) at its own link over the list.
function DetailsButton({ campaign, onDetails }: RowActionProps): React.JSX.Element {
  const label = `Detalhes de ${campaign.name}`;
  if (campaign.myRole) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to={campaign.id} aria-label={label}>
          Detalhes
        </Link>
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={onDetails} aria-label={label}>
      Detalhes
    </Button>
  );
}

// "privada" and "com senha" sit at the left of the footer, pushing the action to the right.
function CampaignFlags({ campaign }: PublicCampaignRowProps): React.JSX.Element {
  return (
    <span className="mr-auto flex min-w-0 items-center gap-3 text-[13px] text-muted-foreground">
      {campaign.visibility === 'private' && (
        <span className="flex items-center gap-1">
          <EyeOffIcon aria-hidden="true" className="size-3.5" />
          privada
        </span>
      )}
      {campaign.hasPassword && (
        <span className="flex items-center gap-1">
          <LockIcon aria-hidden="true" className="size-3.5" />
          com senha
        </span>
      )}
    </span>
  );
}
