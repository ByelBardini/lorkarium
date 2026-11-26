import type { ConditionColorDto, ConditionIconDto, ConditionToneDto } from '@lorkarium/contracts';
import { conditionIconLabelOf } from '@/lib/condition-icons';
import { ConditionMark, type MarkSize } from './condition-marks';

export type ConditionIconPreviewProps = Readonly<{
  icon: ConditionIconDto;
  tone: ConditionToneDto;
  color: ConditionColorDto | null;
}>;

// The badge of the board's strip: 13 px under a 1×1 token, 22 px up close (condition-strip.ts).
const STRIP_SIZES: readonly MarkSize[] = [
  { ring: 'size-[13px]', glyph: 'size-[8px]' },
  { ring: 'size-[22px]', glyph: 'size-[14px]' },
];

/** The icon as the tokens will show it: a token with the badge hung under it, at the two sizes of
 *  the board, and its name.
 *
 *  Example: `<ConditionIconPreview icon={hovered ?? value} tone={tone} color={color} />` */
export function ConditionIconPreview(props: ConditionIconPreviewProps): React.JSX.Element {
  return (
    <section
      aria-label="Prévia no token"
      className="flex items-center gap-3 border-t border-border px-3 py-2"
    >
      {STRIP_SIZES.map((size) => (
        <span key={size.ring} aria-hidden="true" className="flex flex-col items-center">
          <span className="size-8 rounded-full border border-border bg-muted" />
          <span className="-mt-1.5">
            <ConditionMark {...props} size={size} />
          </span>
        </span>
      ))}
      <span className="min-w-0 truncate text-[13px] text-foreground">
        {conditionIconLabelOf(props.icon)}
      </span>
    </section>
  );
}
