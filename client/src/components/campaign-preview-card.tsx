import type {
  CampaignCoverDto,
  CampaignStatusDto,
  CampaignVisibilityDto,
  ContentWarningDto,
} from '@lorkarium/contracts';
import { useId } from 'react';
import { CampaignCover } from '@/components/campaign-cover';
import { StatusBadge } from '@/components/status-badge';
import { CONTENT_WARNING_LABEL, sortedContentWarnings } from '@/lib/content-warnings';
import { cn } from '@/lib/utils';

// More would wrap the card; the detail shows every tag.
const PREVIEW_TAGS_MAX = 3;

/** What the preview shows: a draft of the form or a stored campaign alike. */
export type CampaignPreview = Readonly<{
  name: string;
  system: string | null;
  status: CampaignStatusDto;
  description: string | null;
  visibility: CampaignVisibilityDto;
  hasPassword: boolean;
  cover: CampaignCoverDto;
  contentWarnings: readonly ContentWarningDto[];
  tags: readonly string[];
}>;

export type CampaignPreviewCardProps = Readonly<{
  campaign: CampaignPreview;
  /** The overline that names the preview. */
  label?: string;
  className?: string;
}>;

/** How the campaign looks to the players in the hub, as the master types: cover with the role and
 *  the status, the name (a waiting text while blank), the meta, the description, the warnings and
 *  then at most 3 tags.
 *
 *  Example: `<CampaignPreviewCard campaign={{ ...draft, hasPassword: draft.password !== '' }} />` */
export function CampaignPreviewCard(props: CampaignPreviewCardProps): React.JSX.Element {
  const { campaign } = props;
  const labelId = useId();
  const name = campaign.name.trim();
  return (
    <section aria-labelledby={labelId} className={cn('flex flex-col gap-3', props.className)}>
      <p
        id={labelId}
        className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
      >
        {props.label ?? 'Assim ela aparece no hub'}
      </p>
      <div className="overflow-hidden rounded-md border border-divider bg-card">
        <PreviewCover campaign={campaign} />
        <div className="flex flex-col gap-1.5 px-4 pt-3.5 pb-4">
          <p
            className={cn(
              'font-display text-[22px] leading-tight font-semibold break-words',
              name ? 'text-foreground' : 'text-placeholder',
            )}
          >
            {name || 'Sua mesa nova'}
          </p>
          <p className="text-[13px] text-muted-foreground">{previewMeta(campaign)}</p>
          {campaign.description?.trim() && (
            <p className="line-clamp-3 text-xs leading-normal text-muted-foreground">
              {campaign.description}
            </p>
          )}
          <PreviewLabels campaign={campaign} />
        </div>
      </div>
    </section>
  );
}

function PreviewCover({ campaign }: Readonly<{ campaign: CampaignPreview }>): React.JSX.Element {
  return (
    <div className="relative">
      <CampaignCover cover={campaign.cover} className="aspect-[16/10] w-full" />
      <span className="absolute top-2.5 left-2.5 rounded-sm bg-panel/85 px-2 py-1 text-[10px] font-bold tracking-[0.12em] text-primary uppercase">
        Mestre
      </span>
      <span className="absolute top-2.5 right-2.5 rounded-sm bg-panel/85 px-2 py-1">
        <StatusBadge status={campaign.status} className="text-[11px]" />
      </span>
    </div>
  );
}

// Warnings first: they are what a player must see before joining.
function PreviewLabels({ campaign }: Readonly<{ campaign: CampaignPreview }>) {
  const warnings = sortedContentWarnings(campaign.contentWarnings);
  const tags = campaign.tags.slice(0, PREVIEW_TAGS_MAX);
  if (warnings.length === 0 && tags.length === 0) return null;
  return (
    <ul aria-label="Avisos e tags" className="flex flex-wrap gap-1.5 pt-1">
      {warnings.map((warning) => (
        <li
          key={warning}
          className="rounded-sm border border-destructive/60 px-1.5 py-0.5 text-[11px] text-destructive-text"
        >
          {CONTENT_WARNING_LABEL[warning]}
        </li>
      ))}
      {tags.map((tag) => (
        <li
          key={tag}
          className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}

function previewMeta(campaign: CampaignPreview): string {
  const parts = [
    campaign.system?.trim() || 'Sistema a definir',
    campaign.visibility === 'private' ? 'privada' : 'pública',
  ];
  if (campaign.hasPassword) parts.push('com senha');
  return parts.join(' · ');
}
