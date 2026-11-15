import type { AssetPurposeDto, CampaignCoverDto } from '@lorkarium/contracts';
import { useId } from 'react';
import { CampaignCover } from '@/components/campaign-cover';
import { CoverPicker } from '@/components/cover-picker';
import type { CropAreaComponent } from '@/components/image-crop/image-crop-dialog';
import { featureGate, type PlanGate } from '@/features/plans/plan-gate';
import { usePlanLimits } from '@/features/plans/use-plan-limits';
import { campaignImageOf, type CampaignImageFormat } from '@/lib/campaign-cover';
import type { AssetsApi } from '@/services/assets-api';
import { CampaignImageSlot } from './campaign-image-slot';
import type { SettingsDraft, SettingsValues } from './use-campaign-settings-draft';

const RATIO_TEXT: Readonly<Record<CampaignImageFormat, string>> = {
  photo: '1:1',
  cover: '2:1',
  banner: '3:1',
};

const PROPORTION_HINT: Readonly<Record<CampaignImageFormat, string>> = {
  photo: 'Quadrada, proporção 1:1.',
  cover: 'Retangular, proporção 2:1.',
  banner: 'Faixa larga, proporção 3:1.',
};

type OptionalFormat = Readonly<{
  title: string;
  purpose: AssetPurposeDto;
  hint: string;
  key: 'photoAssetId' | 'bannerAssetId';
}>;

const OPTIONAL_FORMATS = {
  photo: {
    title: 'Foto',
    purpose: 'campaign_photo',
    hint: 'Sem foto, a mesa usa a capa.',
    key: 'photoAssetId',
  },
  banner: {
    title: 'Banner',
    purpose: 'campaign_banner',
    hint: 'Sem banner, a mesa usa a capa.',
    key: 'bannerAssetId',
  },
} as const satisfies Record<'photo' | 'banner', OptionalFormat>;

export type CampaignImageFieldsProps = Readonly<{
  draft: SettingsDraft;
  campaignId: string;
  assets: AssetsApi;
  /** The drawn cover "Usar capa desenhada" goes back to. */
  drawnCover: CampaignCoverDto;
  /** The drag-and-zoom area of the crop dialog; a spec passes a fake. */
  cropArea?: CropAreaComponent;
}>;

/** The three images of the campaign as slots of one height (the 1:1 photo, the 2:1 cover and the
 *  3:1 banner; the columns follow the proportions), and the drawn cover in a strip under them.
 *  Photo and banner are optional and fall back to the cover. Without `campaignArt` in the table's
 *  plan the cover and the banner come from the photo: their slots are locked with the plan's
 *  hint, unless an image is already there.
 *
 *  Example: `<CampaignImageFields draft={draft} campaignId={id} assets={assets} drawnCover={cover} />` */
export function CampaignImageFields(props: CampaignImageFieldsProps): React.JSX.Element {
  const art = featureGate(usePlanLimits().table, (limits) => limits.campaignArt);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-3 sm:grid-cols-[1fr_2fr_3fr]">
        <OptionalImageField {...props} art={art} format="photo" />
        <CoverField {...props} art={art} />
        <OptionalImageField {...props} art={art} format="banner" />
      </div>
      <DrawnCoverStrip {...props} />
    </div>
  );
}

type WithArt = Readonly<{ art: PlanGate }>;

type OptionalImageFieldProps = CampaignImageFieldsProps &
  WithArt &
  Readonly<{ format: 'photo' | 'banner' }>;

function OptionalImageField({ draft, format, art, ...props }: OptionalImageFieldProps) {
  const text = OPTIONAL_FORMATS[format];
  const assetId = draft.values[text.key];
  const locked = format === 'banner' && !art.open && assetId === null;
  const hint = assetId === null ? optionalHintOf(format, art) : null;
  return (
    <ImageField title={text.title} format={format}>
      <CampaignImageSlot
        campaignId={props.campaignId}
        purpose={text.purpose}
        assets={props.assets}
        hasImage={assetId !== null}
        removeLabel="Usar a capa"
        disabled={locked}
        cropArea={props.cropArea}
        onChange={(asset) => draft.change(imagePatchOf(text.key, asset?.id ?? null))}
        preview={<ImagePreview format={format} values={draft.values} campaignArt={art.open} />}
      />
      <FieldHint locked={locked} art={art} hint={hint} />
    </ImageField>
  );
}

// Without `campaignArt` the photo is what the cover and the banner show, so its absence leaves
// the drawing; the banner hint names the photo it falls back to.
function optionalHintOf(format: 'photo' | 'banner', art: PlanGate): string {
  if (art.open) return OPTIONAL_FORMATS[format].hint;
  return format === 'photo' ? 'Sem foto, a mesa usa a capa desenhada.' : 'A mesa usa a foto.';
}

type FieldHintProps = WithArt & Readonly<{ locked: boolean; hint: string | null }>;

// Locked: the field's own hint gives way to the photo it uses and the plan that frees it.
function FieldHint({ locked, art, hint }: FieldHintProps): React.JSX.Element | null {
  const text = locked ? `A mesa usa a foto. ${art.hint ?? ''}`.trim() : hint;
  if (text === null) return null;
  return <p className="text-xs text-placeholder">{text}</p>;
}

function imagePatchOf(key: OptionalFormat['key'], assetId: string | null): Partial<SettingsValues> {
  return key === 'photoAssetId' ? { photoAssetId: assetId } : { bannerAssetId: assetId };
}

function CoverField(props: CampaignImageFieldsProps & WithArt): React.JSX.Element {
  const { draft, drawnCover, art } = props;
  const { cover } = draft.values;
  const locked = !art.open && cover.kind === 'drawn';
  const hint = cover.kind === 'drawn' ? 'Sem imagem, a capa usa o desenho abaixo.' : null;
  return (
    <ImageField title="Capa" format="cover">
      <CampaignImageSlot
        campaignId={props.campaignId}
        purpose="cover"
        assets={props.assets}
        hasImage={cover.kind === 'image'}
        removeLabel="Usar capa desenhada"
        disabled={locked}
        cropArea={props.cropArea}
        onChange={(asset) =>
          draft.change({ cover: asset ? { kind: 'image', assetId: asset.id } : drawnCover })
        }
        preview={<ImagePreview format="cover" values={draft.values} campaignArt={art.open} />}
      />
      <FieldHint locked={locked} art={art} hint={hint} />
    </ImageField>
  );
}

function DrawnCoverStrip({ draft }: CampaignImageFieldsProps): React.JSX.Element {
  const titleId = useId();
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-md border border-divider bg-card p-3.5 lg:flex-row lg:items-center lg:gap-5"
    >
      <div className="flex flex-col gap-0.5 lg:w-40 lg:shrink-0">
        <span id={titleId} className="text-[13px] font-semibold text-label">
          Capa desenhada
        </span>
        <span className="text-xs text-placeholder">
          Entra no lugar da capa e do banner sem imagem. Escolher um desenho troca a imagem.
        </span>
      </div>
      <CoverPicker
        className="min-w-0 flex-1 sm:flex-row sm:items-end sm:gap-5 [&>div:first-child]:flex-1"
        value={draft.values.cover}
        onChange={(cover) => draft.change({ cover })}
      />
    </div>
  );
}

type ImagePreviewProps = Readonly<{
  format: CampaignImageFormat;
  values: SettingsValues;
  campaignArt: boolean;
}>;

// The preview resolves the fallback, so a photo not set shows the cover the screens will use;
// a drawing is tagged, so the slot never reads as an image already sent.
function ImagePreview({ format, values, campaignArt }: ImagePreviewProps): React.JSX.Element {
  const drawn = campaignImageOf({ ...values, campaignArt }, format).kind === 'drawn';
  return (
    <span data-campaign-image-preview={format} className="relative block">
      <CampaignCover {...values} campaignArt={campaignArt} format={format} className="w-full" />
      {drawn && (
        <span
          aria-hidden="true"
          className="absolute bottom-1.5 left-1.5 rounded-sm bg-background/85 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.06em] text-muted-foreground uppercase"
        >
          Desenhada
        </span>
      )}
    </span>
  );
}

type ImageFieldProps = Readonly<{
  title: string;
  format: CampaignImageFormat;
  children: React.ReactNode;
}>;

function ImageField({ title, format, children }: ImageFieldProps): React.JSX.Element {
  const titleId = useId();
  const hintId = useId();
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      aria-describedby={hintId}
      className="flex min-w-0 flex-col gap-2"
    >
      <div className="flex items-baseline gap-2">
        <span id={titleId} className="text-[13px] font-semibold text-label">
          {title}
        </span>
        <span aria-hidden="true" className="text-xs text-placeholder">
          {RATIO_TEXT[format]}
        </span>
        <span id={hintId} className="sr-only">
          {PROPORTION_HINT[format]} A imagem enviada é recortada nesse formato.
        </span>
      </div>
      {children}
    </div>
  );
}
