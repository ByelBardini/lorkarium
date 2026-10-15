import type { CampaignSummaryDto } from '@lorkarium/contracts';
import { ArrowRightIcon } from 'lucide-react';
import { Link } from 'react-router';
import { CampaignCover } from '@/components/campaign-cover';
import { campaignMeta } from '@/lib/campaign-meta';
import { EnterCampaignButton } from '@/features/campaigns/enter-campaign-button';

export type ContinueBandProps = Readonly<{ campaign: CampaignSummaryDto }>;

/** "Continuar": the campaign the user entered last, with a large cover and a way straight in.
 *  A band separated by hairlines, not a floating card.
 *
 *  Example: `{candidate && <ContinueBand campaign={candidate} />}` */
export function ContinueBand({ campaign }: ContinueBandProps): React.JSX.Element {
  return (
    <section
      aria-labelledby="continue-band-title"
      className="flex flex-col border-y border-border sm:flex-row"
    >
      <CampaignCover campaignId={campaign.id} className="h-40 sm:h-auto sm:min-h-48 sm:w-2/5" />
      <div className="flex flex-1 flex-col justify-center gap-4 py-6 sm:px-8">
        <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          <span id="continue-band-title">Continuar</span>
        </p>
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[34px] leading-[1.1] font-semibold">{campaign.name}</h2>
          <p className="text-sm text-muted-foreground">{campaignMeta(campaign)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <EnterCampaignButton campaignId={campaign.id} />
          <Link to={`/campaigns/${campaign.id}`} className="inline-flex items-center gap-1 text-sm">
            Detalhes
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
