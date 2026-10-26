import { cn } from '@/lib/utils';

// The silhouettes of `docs/pages/mesa/dados/Dados.dc.html`, on a 24 × 24 box: domain drawings,
// lucide has no die per number of sides.
const DIE_PATHS: Readonly<Record<number, string>> = {
  4: 'M12 3L21.5 19.5H2.5Z',
  6: 'M5 5h14v14H5Z',
  8: 'M12 2L21 12L12 22L3 12Z M3 12h18',
  10: 'M12 2L20.5 10L12 22L3.5 10Z M3.5 10L12 13L20.5 10 M12 13V22',
  12: 'M12 2L21.5 9L18 20.5H6L2.5 9Z',
  20: 'M12 2L20.5 7v10L12 22L3.5 17V7Z M12 7l4.5 7.5h-9Z',
  100: 'M8 3L13 8L8 16L3 8Z M16 8L21 13L16 21L11 13Z',
};

const FALLBACK_SIDES = 20;

export type DieGlyphProps = Readonly<{ sides: number; className?: string }>;

/** The outline of a die (d4, d6, d8, d10, d12, d20, d% for 100), stroked in `currentColor` and
 *  hidden from screen readers: the button around it says which die it is. Other sides draw the d20.
 *
 *  Example: `<DieGlyph sides={20} className="size-6" />` */
export function DieGlyph({ sides, className }: DieGlyphProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('size-6', className)}
    >
      <path d={DIE_PATHS[sides] ?? DIE_PATHS[FALLBACK_SIDES]} />
    </svg>
  );
}
