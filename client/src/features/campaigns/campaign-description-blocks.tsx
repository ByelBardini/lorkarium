import type { CampaignInfoDto } from '@lorkarium/contracts';
import { useId } from 'react';
import { CONTENT_WARNING_LABEL, sortedContentWarnings } from '@/lib/content-warnings';

/** The small uppercase label over each block of a campaign's description. */
export const OVERLINE =
  'text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase';

/** "Sobre a mesa": the master's description, line breaks kept.
 *
 *  Example: `{campaign.description && <CampaignAbout description={campaign.description} />}` */
export function CampaignAbout({
  description,
}: Readonly<{ description: string }>): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h3 className={OVERLINE}>Sobre a mesa</h3>
      <p className="max-w-prose text-[15px] leading-relaxed whitespace-pre-line text-foreground">
        {description}
      </p>
    </section>
  );
}

export type CampaignLabelsProps = Readonly<{
  campaign: Pick<CampaignInfoDto, 'contentWarnings' | 'tags'>;
}>;

/** "Avisos de conteúdo" and "Tags", each only when there is one; nothing at all without both.
 *
 *  Example: `<CampaignLabels campaign={campaign} />` */
export function CampaignLabels({ campaign }: CampaignLabelsProps): React.JSX.Element | null {
  const warnings = sortedContentWarnings(campaign.contentWarnings);
  if (warnings.length === 0 && campaign.tags.length === 0) return null;
  // Warnings before tags: they are what a player must see before joining.
  return (
    <div className="flex flex-col gap-4">
      {warnings.length > 0 && (
        <LabelList title="Avisos de conteúdo" tone="warning">
          {warnings.map((warning) => CONTENT_WARNING_LABEL[warning])}
        </LabelList>
      )}
      {campaign.tags.length > 0 && (
        <LabelList title="Tags" tone="tag">
          {campaign.tags}
        </LabelList>
      )}
    </div>
  );
}

const LABEL_TONE = {
  warning: 'border border-destructive/60 text-destructive-text',
  tag: 'bg-muted text-muted-foreground',
} as const;

type LabelListProps = Readonly<{
  title: string;
  tone: keyof typeof LABEL_TONE;
  children: readonly string[];
}>;

function LabelList({ title, tone, children }: LabelListProps): React.JSX.Element {
  const titleId = useId();
  return (
    <section className="flex flex-col gap-2">
      <h3 id={titleId} className={OVERLINE}>
        {title}
      </h3>
      <ul aria-labelledby={titleId} className="flex flex-wrap gap-1.5">
        {children.map((label) => (
          <li key={label} className={`rounded-sm px-2 py-0.5 text-xs ${LABEL_TONE[tone]}`}>
            {label}
          </li>
        ))}
      </ul>
    </section>
  );
}
