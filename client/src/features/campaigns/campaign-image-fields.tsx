import type { AssetPurposeDto, CampaignCoverDto } from '@lorkarium/contracts';
import { useId } from 'react';
import { CampaignCover } from '@/components/campaign-cover';
import { CoverPicker } from '@/components/cover-picker';
import type { CropAreaComponent } from '@/components/image-crop/image-crop-dialog';
import { ImagePicker } from '@/components/image-picker';
import type { CampaignImageFormat } from '@/lib/campaign-cover';
import { cn } from '@/lib/utils';
import type { AssetsApi } from '@/services/assets-api';
import type { SettingsDraft, SettingsValues } from './use-campaign-settings-draft';

const PREVIEW_WIDTH: Readonly<Record<CampaignImageFormat, string>> = {
  photo: 'w-28',
  cover: 'w-56',
  banner: 'w-72',
};

const PROPORTION_HINT: Readonly<Record<CampaignImageFormat, string>> = {
  photo: 'Quadrada, proporção 1:1.',
  cover: 'Retangular, proporção 2:1.',
  banner: 'Faixa larga, proporção 3:1.',
};

type OptionalFormat = Readonly<{
  title: string;
  pickerLabel: string;
  purpose: AssetPurposeDto;
  hint: string;
  key: 'photoAssetId' | 'bannerAssetId';
}>;

const OPTIONAL_FORMATS = {
  photo: {
    title: 'Foto',
    pickerLabel: 'Imagem da foto',
    purpose: 'campaign_photo',
    hint: 'Sem foto, a mesa usa a capa.',
    key: 'photoAssetId',
  },
  banner: {
    title: 'Banner',
    pickerLabel: 'Imagem do banner',
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

/** The three images of the campaign, each with a preview in its proportion: the 1:1 photo, the 2:1
 *  cover (drawn or an image) and the 3:1 banner. Photo and banner are optional and fall back to
 *  the cover.
 *
 *  Example: `<CampaignImageFields draft={draft} campaignId={id} assets={assets} drawnCover={cover} />` */
export function CampaignImageFields(props: CampaignImageFieldsProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid items-stretch gap-6 lg:grid-cols-3">
        <OptionalImageField {...props} format="photo" />
        <CoverField {...props} />
        <OptionalImageField {...props} format="banner" />
      </div>
      <DrawnCoverField {...props} />
    </div>
  );
}

type OptionalImageFieldProps = CampaignImageFieldsProps & Readonly<{ format: 'photo' | 'banner' }>;

function OptionalImageField({ draft, format, ...props }: OptionalImageFieldProps) {
  const text = OPTIONAL_FORMATS[format];
  const assetId = draft.values[text.key];
  return (
    <ImageField title={text.title} format={format} values={draft.values}>
      <ImagePicker
        campaignId={props.campaignId}
        purpose={text.purpose}
        assets={props.assets}
        value={assetId}
        label={text.pickerLabel}
        removeLabel="Usar a capa"
        cropArea={props.cropArea}
        onChange={(asset) => draft.change(imagePatchOf(text.key, asset?.id ?? null))}
      />
      {assetId === null && <p className="text-xs text-muted-foreground">{text.hint}</p>}
    </ImageField>
  );
}

function imagePatchOf(key: OptionalFormat['key'], assetId: string | null): Partial<SettingsValues> {
  return key === 'photoAssetId' ? { photoAssetId: assetId } : { bannerAssetId: assetId };
}

function CoverField(props: CampaignImageFieldsProps): React.JSX.Element {
  return (
    <ImageField title="Capa" format="cover" values={props.draft.values}>
      <CoverImagePicker {...props} />
      {props.draft.values.cover.kind === 'drawn' && (
        <p className="text-xs text-muted-foreground">Sem imagem, a capa usa o desenho abaixo.</p>
      )}
    </ImageField>
  );
}

function DrawnCoverField({ draft }: CampaignImageFieldsProps): React.JSX.Element {
  const titleId = useId();
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="flex flex-col items-center gap-3 rounded-lg border border-border p-4 text-center"
    >
      <div className="flex flex-col gap-0.5">
        <span id={titleId} className="text-[13px] font-medium text-label">
          Capa desenhada
        </span>
        <span className="text-xs text-muted-foreground">
          Usada quando a capa não tem imagem. Escolher um desenho troca a imagem por ele.
        </span>
      </div>
      <CoverPicker
        className="w-full max-w-xl [&_[role=radiogroup]]:justify-center"
        value={draft.values.cover}
        onChange={(cover) => draft.change({ cover })}
      />
    </div>
  );
}

function CoverImagePicker({ draft, drawnCover, ...props }: CampaignImageFieldsProps) {
  const { cover } = draft.values;
  return (
    <ImagePicker
      campaignId={props.campaignId}
      purpose="cover"
      assets={props.assets}
      value={cover.kind === 'image' ? cover.assetId : null}
      label="Imagem da capa"
      removeLabel="Usar capa desenhada"
      cropArea={props.cropArea}
      onChange={(asset) =>
        draft.change({ cover: asset ? { kind: 'image', assetId: asset.id } : drawnCover })
      }
    />
  );
}

type ImageFieldProps = Readonly<{
  title: string;
  format: CampaignImageFormat;
  values: SettingsValues;
  children: React.ReactNode;
}>;

// The preview resolves the fallback, so a photo not set shows the cover the screens will use.
function ImageField({ title, format, values, children }: ImageFieldProps): React.JSX.Element {
  const titleId = useId();
  const hintId = useId();
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      aria-describedby={hintId}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4"
    >
      <div className="flex flex-col gap-0.5">
        <span id={titleId} className="text-[13px] font-medium text-label">
          {title}
        </span>
        <span id={hintId} className="text-xs text-muted-foreground">
          {PROPORTION_HINT[format]} A imagem enviada é recortada nesse formato.
        </span>
      </div>
      <div className="flex h-28 items-center justify-center">
        <div
          data-campaign-image-preview={format}
          className={cn('max-w-full', PREVIEW_WIDTH[format])}
        >
          <CampaignCover
            {...values}
            format={format}
            className="w-full rounded-md border border-border"
          />
        </div>
      </div>
      {children}
    </div>
  );
}
