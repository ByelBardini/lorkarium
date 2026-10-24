import type { CampaignSummaryDto } from '@lorkarium/contracts';
import { ArrowRightIcon } from 'lucide-react';
import { Link } from 'react-router';
import { CampaignCover } from '@/components/campaign-cover';
import { StatusBadge } from '@/components/status-badge';
import { campaignMeta, ROLE_LABEL } from '@/lib/campaign-meta';

export type CampaignRowProps = Readonly<{ campaign: CampaignSummaryDto }>;

/** One campaign as an index line: thumbnail, name, status, meta, a line of description and the
 *  role.
 *  No box, shadow or lift: rows are separated by a hairline; hover paints no background (a
 *  full-width band looks detached), it turns the name gold and shows the arrow.
 *
 *  Example: `<ul>{campaigns.map((c) => <CampaignRow key={c.id} campaign={c} />)}</ul>` */
export function CampaignRow({ campaign }: CampaignRowProps): React.JSX.Element {
  return (
    <li className="border-b border-divider last:border-b-0">
      <Link
        to={`/campaigns/${campaign.id}`}
        className="group flex items-center gap-4 py-3 text-foreground no-underline hover:text-foreground hover:no-underline"
      >
        <CampaignCover
          cover={campaign.cover}
          className="size-16 shrink-0 opacity-80 transition-opacity group-hover:opacity-100"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-display text-[22px] leading-tight font-semibold transition-colors group-hover:text-primary">
            {campaign.name}
          </span>
          <span className="flex min-w-0 items-center gap-3">
            <StatusBadge status={campaign.status} className="shrink-0" />
            <span className="truncate text-[13px] text-muted-foreground">
              {campaignMeta(campaign)}
            </span>
          </span>
          {campaign.description && (
            <span className="hidden truncate text-[13px] text-placeholder md:block">
              {campaign.description}
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs font-semibold tracking-[0.12em] text-label uppercase">
          {ROLE_LABEL[campaign.myRole]}
        </span>
        <ArrowRightIcon
          aria-hidden="true"
          className="size-4 shrink-0 -translate-x-1 text-primary opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
        />
      </Link>
    </li>
  );
}
