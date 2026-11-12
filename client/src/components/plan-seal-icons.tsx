import { cn } from '@/lib/utils';

export type SealIconProps = Readonly<{ className?: string }>;

type SealGlyphProps = SealIconProps &
  Readonly<{ viewBox?: string; strokeWidth?: number; children: React.ReactNode }>;

// Drawn for Lorkarium in the stroke of the logo (straight lines, crystal facets, round joins, the
// same weight), not taken from lucide: the seals are the house's own marks.
function SealGlyph({
  className,
  viewBox = '0 0 24 24',
  strokeWidth = 2,
  children,
}: SealGlyphProps): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={cn('shrink-0', className)}
    >
      {children}
    </svg>
  );
}

/** Narrador: a quill with cut barbs, shaft and nib.
 *
 *  Example: `<NarradorSealIcon className="size-3" />` */
export function NarradorSealIcon({ className }: SealIconProps): React.JSX.Element {
  return (
    <SealGlyph className={className}>
      <path d="M20.5 3.5 L19 10 L16 10.8 L17.2 12.4 L13.5 13.8 L9.5 14.5 L10.2 10.5 L12.4 9.6 L11.6 7.6 L14 5 Z" />
      <path d="M20.5 3.5 L6.5 17.5" strokeOpacity={0.7} />
      <path d="M6.5 17.5 L5.2 17.3 L3 21 L6.7 18.8 Z" />
    </SealGlyph>
  );
}

/** Lenda: a coat of arms with a chevron.
 *
 *  Example: `<LendaSealIcon className="size-3" />` */
export function LendaSealIcon({ className }: SealIconProps): React.JSX.Element {
  return (
    <SealGlyph className={className}>
      <path d="M12 2.5 L19.5 5.2 V11.5 L12 21.5 L4.5 11.5 V5.2 Z" />
      <path d="M7.5 12.5 L12 8.8 L16.5 12.5" />
      <path d="M12 12.8 V18" strokeOpacity={0.55} />
    </SealGlyph>
  );
}

/** Amigo do Dono: the chalice of the toast.
 *
 *  Example: `<AmigoDoDonoSealIcon className="size-3" />` */
export function AmigoDoDonoSealIcon({ className }: SealIconProps): React.JSX.Element {
  return (
    <SealGlyph className={className}>
      <path d="M5.5 3.5 H18.5 L17 9.5 L12 13 L7 9.5 Z" />
      <path d="M7 9.5 H17" strokeOpacity={0.7} />
      <path d="M12 13 V18.5" />
      <path d="M7.5 20.5 H16.5 L12 18.5 Z" />
    </SealGlyph>
  );
}

/** Apoiador: a faceted flame with its core (who keeps the fire lit).
 *
 *  Example: `<ApoiadorSealIcon className="size-3" />` */
export function ApoiadorSealIcon({ className }: SealIconProps): React.JSX.Element {
  return (
    <SealGlyph className={className}>
      <path d="M12 2.5 L17 10 L17.5 15 L12 21.5 L6.5 15 L7 10 Z" />
      <path d="M12 11 L14.5 15.5 L12 18.5 L9.5 15.5 Z" />
    </SealGlyph>
  );
}

/** Admin: a raised sword (blade, guard, grip and pommel).
 *
 *  Example: `<AdminSealIcon className="size-3" />` */
export function AdminSealIcon({ className }: SealIconProps): React.JSX.Element {
  return (
    <SealGlyph className={className}>
      <path d="M12 2.5 L13.6 5 V15 H10.4 V5 Z" />
      <path d="M7 15 H17" />
      <path d="M12 15 V19.2" />
      <path d="M12 19.2 L13.3 20.6 L12 22 L10.7 20.6 Z" />
    </SealGlyph>
  );
}

/** Dono do Lorkarium: the logo's three crystals, spread apart and thinner than
 *  `packages/brand/logo-mark.svg` so they do not merge at seal size.
 *
 *  Example: `<LorkariumOwnerSealIcon className="size-3" />` */
export function LorkariumOwnerSealIcon({ className }: SealIconProps): React.JSX.Element {
  return (
    <SealGlyph className={className} viewBox="0 0 120 120" strokeWidth={7.5}>
      <path d="M60 9 L78 42 L60 99 L42 42 Z" />
      <path d="M20 48 L35 58.5 L42.5 86 L23.5 67.5 Z" />
      <path d="M100 48 L85 58.5 L77.5 86 L96.5 67.5 Z" />
    </SealGlyph>
  );
}
