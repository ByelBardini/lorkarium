import type { CampaignStatusDto } from '@lorkarium/contracts';
import { CAMPAIGN_STATUS_LABEL, statusToneClass } from '@/lib/campaign-status';
import { cn } from '@/lib/utils';

export type StatusBadgeProps = Readonly<{ status: CampaignStatusDto; className?: string }>;

/** The campaign status as a dot and its label in spaced caps, both in the status tone; the dot
 *  is never the only cue (the label says it too).
 *
 *  Example: `<StatusBadge status={campaign.status} />` */
export function StatusBadge({ status, className }: StatusBadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] uppercase',
        statusToneClass(status),
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      {CAMPAIGN_STATUS_LABEL[status]}
    </span>
  );
}
