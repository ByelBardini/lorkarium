import { ArrowRightIcon, LoaderCircleIcon } from 'lucide-react';
import { useFetcher } from 'react-router';
import { Button } from '@/components/ui/button';
import type { CampaignsFailureKind } from '@/services/campaigns-api';
import { failureMessage } from './campaign-messages';

export type EnterCampaignResult = Readonly<{ failure: CampaignsFailureKind }>;

export type EnterCampaignButtonProps = Readonly<{ campaignId: string }>;

/** "Entrar na mesa": posts to the campaign route action, which records the entry and redirects
 *  to the table. A refusal stays next to the button.
 *
 *  Example: `<EnterCampaignButton campaignId={campaign.id} />` */
export function EnterCampaignButton({ campaignId }: EnterCampaignButtonProps): React.JSX.Element {
  const fetcher = useFetcher<EnterCampaignResult>();
  const entering = fetcher.state !== 'idle';
  const enter = (): void => {
    void fetcher.submit(null, { method: 'post', action: `/campaigns/${campaignId}` });
  };
  return (
    <div className="flex flex-col items-start gap-2">
      <Button size="lg" onClick={enter} disabled={entering} aria-busy={entering}>
        {entering ? 'Entrando…' : 'Entrar na mesa'}
        {entering ? (
          <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
        ) : (
          <ArrowRightIcon aria-hidden="true" />
        )}
      </Button>
      {fetcher.data?.failure && (
        <p role="alert" className="text-sm text-destructive-text">
          {failureMessage(fetcher.data.failure)}
        </p>
      )}
    </div>
  );
}
