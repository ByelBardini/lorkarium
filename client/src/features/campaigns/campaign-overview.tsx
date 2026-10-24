import type { CampaignDetailDto, CampaignMemberDto } from '@lorkarium/contracts';
import { useId } from 'react';
import { CopyCodeButton } from '@/components/copy-code-button';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import { formatCampaignCode } from '@/lib/campaign-code';
import { ROLE_LABEL } from '@/lib/campaign-meta';
import { CONTENT_WARNING_LABEL, sortedContentWarnings } from '@/lib/content-warnings';
import { sinceLabel } from '@/lib/since-label';
import type { Clipboard } from '@/services/clipboard';
import { EnterCampaignButton } from './enter-campaign-button';

const CREATED_AT_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const OVERLINE = 'text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase';

export type CampaignOverviewProps = Readonly<{
  campaign: CampaignDetailDto;
  clipboard: Clipboard;
  /** The instant "Último acesso" counts from, fixed once per visit. */
  now: Date;
  onClose: () => void;
}>;

/** "Visão geral" of the detail: system, master, last access and creation, the description, the
 *  warnings and tags, the code (master only) and who is in it, then "Fechar" and "Entrar na mesa".
 *  An empty block (no description, no warnings, no tags) is left out.
 *
 *  Example: `<CampaignOverview campaign={campaign} clipboard={clipboard} now={now} onClose={back} />` */
export function CampaignOverview(props: CampaignOverviewProps): React.JSX.Element {
  const { campaign } = props;
  return (
    <div className="flex flex-col gap-6">
      <CampaignFacts campaign={campaign} now={props.now} />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
        <div className="flex min-w-0 flex-col gap-6">
          {campaign.description && <AboutBlock description={campaign.description} />}
          <LabelsBlock campaign={campaign} />
          {campaign.joinCode && (
            <JoinCodeBlock code={campaign.joinCode} clipboard={props.clipboard} />
          )}
        </div>
        <MemberList members={campaign.members} />
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-start sm:justify-between">
        <Button variant="outline" size="lg" onClick={props.onClose}>
          Fechar
        </Button>
        <EnterCampaignButton campaignId={campaign.id} />
      </div>
    </div>
  );
}

type FactsProps = Readonly<{ campaign: CampaignDetailDto; now: Date }>;

function CampaignFacts({ campaign, now }: FactsProps): React.JSX.Element {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-divider py-4 sm:grid-cols-4">
      <Fact term="Sistema">{campaign.system ?? 'A definir'}</Fact>
      <Fact term="Mestre">{campaign.masterName}</Fact>
      <Fact term="Último acesso">{lastAccessLabel(campaign.lastAccessAt, now)}</Fact>
      <Fact term="Criada em">{CREATED_AT_FORMAT.format(new Date(campaign.createdAt))}</Fact>
    </dl>
  );
}

function Fact({ term, children }: Readonly<{ term: string; children: React.ReactNode }>) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className={OVERLINE}>{term}</dt>
      <dd className="text-[15px] leading-snug font-semibold break-words text-foreground">
        {children}
      </dd>
    </div>
  );
}

function lastAccessLabel(lastAccessAt: string | null, now: Date): string {
  if (lastAccessAt === null) return 'Ninguém entrou ainda';
  const since = sinceLabel(lastAccessAt, now);
  return since.charAt(0).toUpperCase() + since.slice(1);
}

function AboutBlock({ description }: Readonly<{ description: string }>): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h3 className={OVERLINE}>Sobre a mesa</h3>
      <p className="max-w-prose text-[15px] leading-relaxed whitespace-pre-line text-foreground">
        {description}
      </p>
    </section>
  );
}

// Warnings before tags: they are what a player must see before joining.
function LabelsBlock({ campaign }: Readonly<{ campaign: CampaignDetailDto }>) {
  const warnings = sortedContentWarnings(campaign.contentWarnings);
  if (warnings.length === 0 && campaign.tags.length === 0) return null;
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

type JoinCodeBlockProps = Readonly<{ code: string; clipboard: Clipboard }>;

function JoinCodeBlock({ code, clipboard }: JoinCodeBlockProps): React.JSX.Element {
  const formatted = formatCampaignCode(code);
  return (
    <div className="flex flex-col gap-2 border-y border-border py-4">
      <span className={OVERLINE}>Código da mesa</span>
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
          <MemberRow key={member.userId} member={member} />
        ))}
      </ul>
    </section>
  );
}

function MemberRow({ member }: Readonly<{ member: CampaignMemberDto }>): React.JSX.Element {
  return (
    <li className="flex items-center gap-3 border-b border-divider py-2 last:border-b-0">
      <span className="relative shrink-0">
        <UserAvatar name={member.name} color={member.color} avatarId={member.avatarId} size="sm" />
        {member.online && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card bg-chart-4"
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{member.name}</span>
        {member.online && <span className="text-xs text-muted-foreground">online agora</span>}
      </span>
      <span className="text-xs tracking-[0.12em] text-muted-foreground uppercase">
        {ROLE_LABEL[member.role]}
      </span>
    </li>
  );
}
