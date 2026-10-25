import type { ConditionColorDto, ConditionIconDto, ConditionToneDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { CONDITION_COLOR_ENTRIES } from '@/lib/condition-colors';
import { CONDITION_ICON_ENTRIES } from '@/lib/condition-icons';
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
  }>;

// The glyph takes ~65% of the disc, as on the board's badge (ICON_SHARE_OF_BADGE).
const RING = 'grid size-5 shrink-0 place-items-center overflow-hidden rounded-full';
const GLYPH_IN_RING = 'size-[13px]';

type RingLook = Readonly<{ className: string; style?: React.CSSProperties }>;

/** The icon of a condition alone, in its color or by its tone: gold for a benefit and the error
 *  color for a harm or an incapacitating one. The icon field shows it; a tag shows the mark.
 *
 *  Example: `<ConditionGlyph icon="skull" tone="harm" color="ember" />` */
export function ConditionGlyph(props: ConditionGlyphProps): React.JSX.Element {
  const { icon, tone, color = null } = props;
  const Glyph = CONDITION_ICON_ENTRIES[icon].glyph;
  const size = props.className ?? 'size-4';
  if (color !== null) {
    const style = { color: CONDITION_COLOR_ENTRIES[color].hex };
    return (
      <Glyph aria-hidden="true" data-icon={icon} className={cn(size, 'shrink-0')} style={style} />
    );
  }
  const toneClass = tone === 'benefit' ? 'text-primary' : 'text-destructive';
  return <Glyph aria-hidden="true" data-icon={icon} className={cn(size, 'shrink-0', toneClass)} />;
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
      className={cn(RING, ring.className)}
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
  image,
  filled,
  onBroken,
}: MarkFaceProps): React.JSX.Element {
  if (image !== null) {
    const failed = (): void => onBroken(image);
    const look = 'size-full rounded-full object-cover';
    return <img src={assetUrlOf(image)} alt="" onError={failed} className={look} />;
  }
  if (filled) return <DarkGlyph icon={icon} />;
  return <ConditionGlyph icon={icon} tone={tone} color={color} className={GLYPH_IN_RING} />;
}

function DarkGlyph({ icon }: Readonly<{ icon: ConditionIconDto }>): React.JSX.Element {
  const Glyph = CONDITION_ICON_ENTRIES[icon].glyph;
  return (
    <Glyph aria-hidden="true" data-icon={icon} className={cn(GLYPH_IN_RING, 'text-background')} />
  );
}

// A runtime color goes by style: Tailwind cannot build a class from it (Armadilhas, conditions.md).
function filledLookOf(color: ConditionColorDto | null): RingLook {
  if (color === null) return { className: 'border border-destructive bg-destructive' };
  const hex = CONDITION_COLOR_ENTRIES[color].hex;
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
    return { className: base, style: { borderColor: CONDITION_COLOR_ENTRIES[color].hex } };
  return { className: cn(base, tone === 'benefit' ? 'border-primary' : 'border-destructive') };
}
