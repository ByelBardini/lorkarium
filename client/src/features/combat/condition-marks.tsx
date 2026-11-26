import type { ConditionColorDto, ConditionIconDto, ConditionToneDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { chosenConditionColorOf } from '@/lib/condition-colors';
import { conditionIconLabelOf, conditionIconUrlOf } from '@/lib/condition-icons';
import { cn } from '@/lib/utils';
import { assetUrlOf } from '@/services/assets-api';

export type ConditionGlyphProps = Readonly<{
  icon: ConditionIconDto;
  tone: ConditionToneDto;
  /** The master's color; absent or `null`: the tone's. */
  color?: ConditionColorDto | null;
  /** Sizes the glyph (`size-4` when absent). */
  className?: string;
}>;

export type ConditionMarkProps = Omit<ConditionGlyphProps, 'className'> &
  Readonly<{
    /** The master's picture in place of the glyph; absent or `null`: the icon. */
    imageAssetId?: string | null;
    /** The ring and glyph sizes; absent: the 20 px of the lists. */
    size?: MarkSize;
  }>;

/** Tailwind size classes of a mark: the ring, and the glyph at ~65% of it. */
export type MarkSize = Readonly<{ ring: string; glyph: string }>;

// The glyph takes ~65% of the disc, as on the board's badge (ICON_SHARE_OF_BADGE).
const RING = 'grid shrink-0 place-items-center overflow-hidden rounded-full';
const LIST_SIZE: MarkSize = { ring: 'size-5', glyph: 'size-[13px]' };

type RingLook = Readonly<{ className: string; style?: React.CSSProperties }>;

/** The icon of a condition alone, in its color or by its tone: gold for a benefit and the error
 *  color for a harm or an incapacitating one. The icon's white SVG is the mask of a block filled
 *  with the text color, so any library's file takes the condition's color.
 *
 *  Example: `<ConditionGlyph icon="skull" tone="harm" color="ember" />` */
export function ConditionGlyph(props: ConditionGlyphProps): React.JSX.Element {
  const { icon, tone, color = null } = props;
  const toneClass = tone === 'benefit' ? 'text-primary' : 'text-destructive';
  const paint = color === null ? toneClass : undefined;
  const style = color === null ? undefined : { color: chosenConditionColorOf(color) };
  return <IconMask icon={icon} className={cn(props.className ?? 'size-4', paint)} style={style} />;
}

type IconMaskProps = Readonly<{
  icon: ConditionIconDto;
  className: string;
  style?: React.CSSProperties;
}>;

function IconMask({ icon, className, style }: IconMaskProps): React.JSX.Element {
  const url = `url("${conditionIconUrlOf(icon)}")`;
  const mask = { maskImage: url, WebkitMaskImage: url, ...style };
  return (
    <span
      role="img"
      aria-label={conditionIconLabelOf(icon)}
      data-icon={icon}
      className={cn(
        'inline-block shrink-0 bg-current mask-contain mask-center mask-no-repeat',
        className,
      )}
      style={mask}
    />
  );
}

/** A condition as a disc ringed in its color (or its tone's): its image covering the disc, or its
 *  glyph; an incapacitating one is a full disc with a dark glyph, or, with an image, a ring twice
 *  as thick. An image that fails to load gives way to the icon. Never alone: the name goes with it.
 *
 *  Example: `<ConditionMark icon={c.icon} tone={c.tone} color={c.color} imageAssetId={c.imageAssetId} />` */
export function ConditionMark(props: ConditionMarkProps): React.JSX.Element {
  const { tone, color = null, imageAssetId = null } = props;
  const [brokenId, setBrokenId] = useState<string | null>(null);
  const image = imageAssetId !== null && brokenId !== imageAssetId ? imageAssetId : null;
  const filled = tone === 'incapacitating' && image === null;
  const ring = filled ? filledLookOf(color) : ringLookOf(tone, color, image !== null);
  return (
    <span
      aria-hidden="true"
      data-condition-mark=""
      className={cn(RING, (props.size ?? LIST_SIZE).ring, ring.className)}
      style={ring.style}
    >
      <MarkFace {...props} image={image} filled={filled} onBroken={setBrokenId} />
    </span>
  );
}

type MarkFaceProps = ConditionMarkProps &
  Readonly<{ image: string | null; filled: boolean; onBroken: (id: string) => void }>;

function MarkFace({
  icon,
  tone,
  color,
  size = LIST_SIZE,
  image,
  filled,
  onBroken,
}: MarkFaceProps): React.JSX.Element {
  if (image !== null) {
    const failed = (): void => onBroken(image);
    const look = 'size-full rounded-full object-cover';
    return <img src={assetUrlOf(image)} alt="" onError={failed} className={look} />;
  }
  if (filled) return <IconMask icon={icon} className={cn(size.glyph, 'text-background')} />;
  return <ConditionGlyph icon={icon} tone={tone} color={color} className={size.glyph} />;
}

// A runtime color goes by style: Tailwind cannot build a class from it (Armadilhas, conditions.md).
function filledLookOf(color: ConditionColorDto | null): RingLook {
  if (color === null) return { className: 'border border-destructive bg-destructive' };
  const hex = chosenConditionColorOf(color);
  return { className: 'border', style: { borderColor: hex, backgroundColor: hex } };
}

// The image hides the full disc of an incapacitating one, so its gravity moves to the ring.
function ringLookOf(
  tone: ConditionToneDto,
  color: ConditionColorDto | null,
  pictured: boolean,
): RingLook {
  const width = pictured && tone === 'incapacitating' ? 'border-2' : 'border';
  const base = cn('bg-background', width);
  if (color !== null)
    return { className: base, style: { borderColor: chosenConditionColorOf(color) } };
  return { className: cn(base, tone === 'benefit' ? 'border-primary' : 'border-destructive') };
}
