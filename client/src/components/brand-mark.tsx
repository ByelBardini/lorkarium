import { cn } from '@/lib/utils';

export type BrandMarkProps = Readonly<{ variant?: 'full' | 'compact'; className?: string }>;

/** The Lorkarium logo: crystal icon + Cinzel wordmark, announced once as "LORKARIUM".
 *
 *  Example: `<BrandMark variant="compact" className="lg:hidden" />` */
export function BrandMark({ variant = 'full', className }: BrandMarkProps): React.JSX.Element {
  const compact = variant === 'compact';
  return (
    // role="img" makes the letter-spaced wordmark one name instead of nine spelled-out letters.
    <div
      role="img"
      aria-label="LORKARIUM"
      className={cn('flex items-center', compact ? 'gap-2.5' : 'gap-3.5', className)}
    >
      <BrandIcon className={compact ? 'size-8' : 'size-10'} />
      <span
        className={cn(
          'font-brand font-semibold tracking-[0.32em] text-foreground',
          compact ? 'text-base' : 'text-[19px]',
        )}
      >
        LORKARIUM
      </span>
    </div>
  );
}

function BrandIcon({ className }: Readonly<{ className: string }>): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      className={cn('shrink-0 text-primary', className)}
    >
      <g strokeWidth="4">
        <path d="M60 9 L78 42 L60 99 L42 42 Z" />
        <path d="M26 47 L41 57.5 L48.5 85 L29.5 66.5 Z" />
        <path d="M94 47 L79 57.5 L71.5 85 L90.5 66.5 Z" />
      </g>
      <g strokeWidth="2.6" strokeOpacity=".55">
        <path d="M42 42 L51 45 L60 37 L69 45 L78 42" />
        <path d="M60 9 V99 M51 45 L60 99 L69 45" />
      </g>
    </svg>
  );
}
