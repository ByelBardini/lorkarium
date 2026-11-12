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
      <OptionalImageField {...props} format="photo" />
      <CoverField {...props} />
      <OptionalImageField {...props} format="banner" />
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
  const { values, change } = props.draft;
  return (
    <ImageField title="Capa" format="cover" values={values}>
      <CoverPicker
        value={values.cover}
        onChange={(cover) => change({ cover })}
        image={<CoverImagePicker {...props} />}
      />
    </ImageField>
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
  return (
    <div role="group" aria-labelledby={titleId} className="flex flex-col gap-3">
      <span id={titleId} className="text-[13px] font-medium text-label">
        {title}
      </span>
      <div data-campaign-image-preview={format} className={cn('max-w-full', PREVIEW_WIDTH[format])}>
        <CampaignCover
          {...values}
          format={format}
          className="w-full rounded-md border border-border"
        />
      </div>
      {children}
    </div>
  );
}
