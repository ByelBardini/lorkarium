import type { PublicCampaignDto } from '@lorkarium/contracts';
import { LockIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useFetcher } from 'react-router';
import { CampaignCover } from '@/components/campaign-cover';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { campaignMeta, ROLE_LABEL } from '@/lib/campaign-meta';
import type { ExploreActionRequest, ExploreActionResult } from './explore-action';
import { PASSWORD_FAILURES, publicJoinFailureMessage } from './explore-messages';
import { JoinPublicDialog } from './join-public-dialog';

export type PublicCampaignRowProps = Readonly<{ campaign: PublicCampaignDto }>;

/** One public campaign: thumbnail, name, status, meta and, at the right, "Entrar" (asking the
 *  password first when it has one) or, for one the reader is in, their role and "Abrir".
 *
 *  Example: `<ul>{campaigns.map((c) => <PublicCampaignRow key={c.id} campaign={c} />)}</ul>` */
export function PublicCampaignRow({ campaign }: PublicCampaignRowProps): React.JSX.Element {
  const join = usePublicJoin(campaign);
  return (
    <li className="flex flex-col gap-2 border-b border-divider py-3 last:border-b-0">
      <div className="flex items-center gap-4">
        <CampaignCover cover={campaign.cover} className="size-16 shrink-0" />
        <CampaignText campaign={campaign} />
        <RowAction campaign={campaign} join={join} />
      </div>
      {join.rowFailure && (
        <p role="alert" className="text-sm text-destructive">
          {publicJoinFailureMessage(join.rowFailure)}
        </p>
      )}
      {join.asking && (
        <JoinPublicDialog
          campaignName={campaign.name}
          submitting={join.submitting}
          failure={join.failure}
          onSubmit={join.send}
          onClose={join.close}
        />
      )}
    </li>
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
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate font-display text-[22px] leading-tight font-semibold">
        {campaign.name}
      </span>
      <span className="flex min-w-0 items-center gap-3">
        <StatusBadge status={campaign.status} className="shrink-0" />
        <span className="truncate text-[13px] text-muted-foreground">{campaignMeta(campaign)}</span>
        {campaign.hasPassword && (
          <span className="flex shrink-0 items-center gap-1 text-[13px] text-muted-foreground">
            <LockIcon aria-hidden="true" className="size-3.5" />
            com senha
          </span>
        )}
      </span>
      {campaign.description && (
        <span className="hidden truncate text-[13px] text-placeholder md:block">
          {campaign.description}
        </span>
      )}
    </div>
  );
}

type RowActionProps = PublicCampaignRowProps & Readonly<{ join: PublicJoin }>;

function RowAction({ campaign, join }: RowActionProps): React.JSX.Element {
  if (campaign.myRole) {
    return (
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden text-xs font-semibold tracking-[0.12em] text-label uppercase sm:inline">
          {ROLE_LABEL[campaign.myRole]}
        </span>
        <Button asChild variant="outline">
          <Link to={`/campaigns/${campaign.id}`} aria-label={`Abrir ${campaign.name}`}>
            Abrir
          </Link>
        </Button>
      </div>
    );
  }
  const busy = join.submitting && !join.asking;
  return (
    <Button
      className="shrink-0"
      onClick={join.start}
      disabled={join.submitting}
      aria-busy={busy}
      aria-label={`Entrar em ${campaign.name}`}
    >
      {busy ? 'Entrando…' : 'Entrar'}
    </Button>
  );
}
