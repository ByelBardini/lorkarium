import type { AuraEffectDto, AuraImageShapeDto, DrawingColorDto } from '@lorkarium/contracts';
import {
  DropletsIcon,
  FlameIcon,
  FlaskConicalIcon,
  MoonIcon,
  SnowflakeIcon,
  SparklesIcon,
  SunIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react';
import { useId } from 'react';
import { ImagePicker } from '@/components/image-picker';
import { RangeField } from '@/components/range-field';
import { SegmentField, type SegmentOption } from '@/components/segment-field';
import { Slider } from '@/components/ui/slider';
import { COLOR_TILES } from '@/features/drawings/color-tiles';
import { StyleTileGroup, type StyleTile } from '@/features/drawings/style-tile-group';
import { AURA_EFFECT_NAMES } from '@/lib/aura-effects';
import type { SceneDistance } from '@/lib/range-form';
import type { AssetsApi } from '@/services/assets-api';
import { AURA_OPACITY_MAX, AURA_OPACITY_MIN } from '@lorkarium/game-core';
import {
  auraKindChosen,
  type AuraFormErrors,
  type AuraFormValues,
  type AuraKindChoice,
} from './aura-form-state';
import { naturalToneCss } from './aura-tone';

/** Where an image aura is sent: the campaign's assets. */
export type AuraImages = Readonly<{ campaignId: string; assets: AssetsApi }>;

export type AuraEditorProps = Readonly<{
  form: AuraFormValues;
  errors: AuraFormErrors;
  distance: SceneDistance;
  images: AuraImages;
  /** Gets how to change the aura, not the new one: an image that arrives after its upload must
   *  not undo what was typed meanwhile (`setState` takes it as is). */
  onChange: (update: (form: AuraFormValues) => AuraFormValues) => void;
}>;

type AuraChange = (changes: Partial<AuraFormValues>) => void;

const KIND_OPTIONS: readonly SegmentOption<AuraKindChoice>[] = [
  { value: 'none', label: 'Nenhuma' },
  { value: 'color', label: 'Cor' },
  { value: 'effect', label: 'Efeito' },
  { value: 'image', label: 'Imagem' },
];

const IMAGE_SHAPE_OPTIONS: readonly SegmentOption<AuraImageShapeDto>[] = [
  { value: 'square', label: 'Quadrada' },
  { value: 'round', label: 'Redonda' },
];

const EFFECT_ICONS: Readonly<Record<AuraEffectDto, LucideIcon>> = {
  fire: FlameIcon,
  water: DropletsIcon,
  lightning: ZapIcon,
  frost: SnowflakeIcon,
  radiant: SunIcon,
  shadow: MoonIcon,
  poison: FlaskConicalIcon,
  arcane: SparklesIcon,
};

const EFFECT_TILES: readonly StyleTile<AuraEffectDto>[] = AURA_EFFECT_NAMES.map(
  ({ effect, label }) => {
    const Icon = EFFECT_ICONS[effect];
    return { value: effect, label, picture: <Icon aria-hidden="true" className="size-4" /> };
  },
);

// The effect's color is a radio among the palette plus its natural tone, kept as `null`.
const NATURAL = 'natural';
type EffectTone = DrawingColorDto | typeof NATURAL;

const OPACITY_STEP = 5;

/** The aura of a token, as the master's dialog and the "Aura…" of the menu edit it: the kind
 *  (Nenhuma, Cor, Efeito, Imagem), what that kind picks, the radius past the token's edge in the
 *  scene's unit and the opacity.
 *
 *  Example: `<AuraEditor form={aura} errors={errors} distance={scene} images={images} onChange={setAura} />` */
export function AuraEditor(props: AuraEditorProps): React.JSX.Element {
  const { form, errors, distance, images, onChange } = props;
  const change: AuraChange = (changes) => onChange((current) => ({ ...current, ...changes }));
  return (
    <div className="flex flex-col gap-5">
      <SegmentField
        legend="Aura"
        value={form.kind}
        options={KIND_OPTIONS}
        fill
        onChange={(kind) => onChange((current) => auraKindChosen(current, kind))}
      />
      {form.kind !== 'none' && (
        <>
          <AuraLook form={form} errors={errors} images={images} onChange={change} />
          <RangeField
            label={`Raio além da borda (${distance.cellUnit})`}
            value={form.radius}
            error={errors.radius}
            distance={distance}
            onChange={(radius) => change({ radius })}
          />
          <OpacityField value={form.opacity} onChange={(opacity) => change({ opacity })} />
        </>
      )}
    </div>
  );
}

type AuraLookProps = Readonly<{
  form: AuraFormValues;
  errors: AuraFormErrors;
  images: AuraImages;
  onChange: AuraChange;
}>;

function AuraLook({ form, errors, images, onChange }: AuraLookProps) {
  if (form.kind === 'effect') return <EffectFields form={form} onChange={onChange} />;
  if (form.kind === 'image') {
    return (
      <>
        <ImageField
          value={form.imageAssetId}
          error={errors.image}
          images={images}
          onChange={onChange}
        />
        <SegmentField
          legend="Forma"
          value={form.imageShape}
          options={IMAGE_SHAPE_OPTIONS}
          fill
          onChange={(imageShape) => onChange({ imageShape })}
        />
      </>
    );
  }
  return (
    <StyleTileGroup
      legend="Cor da aura"
      value={form.color}
      tiles={COLOR_TILES}
      shape="round"
      onChange={(color) => onChange({ color })}
    />
  );
}

function EffectFields({
  form,
  onChange,
}: Readonly<{ form: AuraFormValues; onChange: AuraChange }>) {
  const natural: StyleTile<EffectTone> = {
    value: NATURAL,
    label: 'Natural',
    picture: <NaturalSwatch tone={naturalToneCss(form.effect)} />,
  };
  return (
    <>
      <StyleTileGroup
        legend="Efeito"
        value={form.effect}
        tiles={EFFECT_TILES}
        shape="grid"
        onChange={(effect) => onChange({ effect })}
      />
      <StyleTileGroup<EffectTone>
        legend="Cor do efeito"
        value={form.effectColor ?? NATURAL}
        tiles={[natural, ...COLOR_TILES]}
        shape="round"
        onChange={(tone) => onChange({ effectColor: tone === NATURAL ? null : tone })}
      />
    </>
  );
}

// The natural tone shows as a glow fading out, so it reads as "the effect's own" next to the flat
// swatches of the palette.
function NaturalSwatch({ tone }: Readonly<{ tone: string }>) {
  return (
    <span
      aria-hidden="true"
      className="size-full rounded-full border border-border"
      style={{ background: `radial-gradient(circle, ${tone} 0%, ${tone} 35%, transparent 75%)` }}
    />
  );
}

type ImageFieldProps = Readonly<{
  value: string | null;
  error: string | undefined;
  images: AuraImages;
  onChange: AuraChange;
}>;

function ImageField({ value, error, images, onChange }: ImageFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <ImagePicker
        campaignId={images.campaignId}
        purpose="aura"
        assets={images.assets}
        value={value}
        label="Imagem da aura"
        removeLabel="Remover imagem da aura"
        onChange={(asset) => onChange({ imageAssetId: asset?.id ?? null })}
      />
      {error && <p className="text-[13px] text-destructive-text">{error}</p>}
    </div>
  );
}

type OpacityFieldProps = Readonly<{ value: number; onChange: (opacity: number) => void }>;

function OpacityField({ value, onChange }: OpacityFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span id={`${id}-label`} className="text-[13px] text-label">
          Opacidade
        </span>
        <span aria-hidden="true" className="text-[13px] text-foreground tabular-nums">
          {value}%
        </span>
      </div>
      <Slider
        aria-labelledby={`${id}-label`}
        aria-valuetext={`${value}%`}
        min={AURA_OPACITY_MIN}
        max={AURA_OPACITY_MAX}
        step={OPACITY_STEP}
        value={[value]}
        onValueChange={([next]) => next !== undefined && onChange(next)}
      />
    </div>
  );
}
