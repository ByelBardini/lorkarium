import { CampaignCover } from '@/components/campaign-cover';
import { CampaignPreviewCard } from '@/components/campaign-preview-card';
import { StatusBadge } from '@/components/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { featureGate } from '@/features/plans/plan-gate';
import { usePlanLimits } from '@/features/plans/use-plan-limits';
import { campaignMeta, type CampaignMetaSource } from '@/lib/campaign-meta';
import { SettingsReadinessList } from './settings-readiness-list';
import type { SettingsValues } from './use-campaign-settings-draft';

const OVERLINE = 'text-[11px] font-semibold tracking-[0.14em] text-placeholder uppercase';

export type SettingsPreviewPanelProps = Readonly<{
  /** The draft: the preview follows the typing. */
  values: SettingsValues;
  campaign: Pick<CampaignMetaSource, 'ownerId' | 'masterName' | 'memberCount'>;
}>;

/** The right column of the settings page: the table as the others will see it where it shows
 *  (Início: the "Continuar" band with the banner and the row with the photo; Explorar: the card
 *  with the cover; Trilho: the photo of the open table), then "Pronta pra receber gente".
 *
 *  Example: `<SettingsPreviewPanel values={draft.values} campaign={campaign} />` */
export function SettingsPreviewPanel(props: SettingsPreviewPanelProps): React.JSX.Element {
  const { campaign } = props;
  // Without `campaignArt` in the plan the screens show the photo in place of cover and banner.
  const art = featureGate(usePlanLimits().table, (limits) => limits.campaignArt);
  const values = { ...props.values, campaignArt: art.open };
  const name = values.name.trim() || 'Mesa sem nome';
  // `null` reader: the preview is for the others, who read the master's name.
  const meta = campaignMeta({ ...campaign, system: values.system.trim() || null }, null);
  const shown = { values, name, meta };
  return (
    <div className="flex flex-col gap-4">
      <Tabs defaultValue="home" className="gap-3">
        <div className="flex items-end justify-between gap-3">
          <span className={OVERLINE}>Como aparece</span>
          <TabsList aria-label="Onde a mesa aparece" className="gap-3">
            <TabsTrigger value="home">Início</TabsTrigger>
            <TabsTrigger value="explore">Explorar</TabsTrigger>
            <TabsTrigger value="rail">Trilho</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="home">
          <HomePreview {...shown} />
        </TabsContent>
        <TabsContent value="explore">
          <ExplorePreview values={values} />
        </TabsContent>
        <TabsContent value="rail">
          <RailPreview {...shown} />
        </TabsContent>
      </Tabs>
      <SettingsReadinessList values={values} />
    </div>
  );
}

type PreviewValues = SettingsValues & Readonly<{ campaignArt: boolean }>;

type ShownProps = Readonly<{ values: PreviewValues; name: string; meta: string }>;

function HomePreview({ values, name, meta }: ShownProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label="Continuar"
        className="overflow-hidden rounded-md border border-divider bg-card"
      >
        <CampaignCover {...values} format="banner" className="w-full" />
        <div className="flex flex-col gap-1 px-3.5 py-3">
          <span className={OVERLINE}>Continuar</span>
          <span className="truncate font-display text-xl leading-tight font-semibold">{name}</span>
          <StatusLine values={values} meta={meta} />
        </div>
      </div>
      <div
        role="group"
        aria-label="Suas mesas"
        className="flex items-center gap-3 rounded-md border border-divider bg-card p-2.5"
      >
        <CampaignCover {...values} format="photo" className="size-12 shrink-0 rounded-sm" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-display text-[17px] leading-tight font-semibold">
            {name}
          </span>
          <StatusLine values={values} meta={meta} />
        </div>
      </div>
    </div>
  );
}

function StatusLine({ values, meta }: Readonly<{ values: PreviewValues; meta: string }>) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <StatusBadge status={values.status} className="shrink-0 text-[10px]" />
      <span className="truncate text-xs text-muted-foreground">{meta}</span>
    </span>
  );
}

function ExplorePreview({ values }: Readonly<{ values: PreviewValues }>): React.JSX.Element {
  const hidden = values.visibility === 'private';
  return (
    <div className="flex flex-col gap-2.5">
      {hidden && (
        <p className="rounded-md border border-divider bg-card px-3 py-2 text-xs text-muted-foreground">
          Privada: não aparece em Explorar. Só entra quem tiver o código.
        </p>
      )}
      <div className={hidden ? 'opacity-50' : undefined}>
        <CampaignPreviewCard
          label="Cartão em Explorar"
          campaign={{ ...values, hasPassword: values.requirePassword }}
        />
      </div>
    </div>
  );
}

// The rail shows the photo alone when collapsed and beside the name when open.
function RailPreview({ values, name }: ShownProps): React.JSX.Element {
  return (
    <div className="flex items-start gap-3 rounded-md border border-divider bg-card p-3">
      <div className="flex w-14 shrink-0 flex-col items-center gap-2 rounded-sm bg-panel py-2.5">
        <CampaignCover {...values} format="photo" className="size-10 rounded-md" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2 rounded-sm bg-panel px-2 py-1.5">
          <CampaignCover {...values} format="photo" className="size-6 shrink-0 rounded-md" />
          <span className="truncate text-[13px] font-semibold">{name}</span>
        </div>
        <p className="text-xs text-placeholder">
          A foto aparece no trilho das mesas abertas, fechado e aberto.
        </p>
      </div>
    </div>
  );
}
