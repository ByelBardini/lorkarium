import type { ConditionColorDto, ConditionIconDto, ConditionToneDto } from '@lorkarium/contracts';
import { useEffect, useRef, useState } from 'react';
import { conditionIconLabelOf } from '@/lib/condition-icons';
import { cn } from '@/lib/utils';
import { ConditionGlyph } from './condition-marks';

/** How many icons the grid draws at a time: the next block comes when its end scrolls into view,
 *  so 4.134 Game-icons never decode at once. */
export const ICON_GRID_BLOCK = 280;
const COLUMNS = 8;
const STEP_OF_KEY: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  ArrowDown: COLUMNS,
  ArrowUp: -COLUMNS,
};

export type ConditionIconGridProps = Readonly<{
  label: string;
  icons: readonly ConditionIconDto[];
  value: ConditionIconDto;
  tone: ConditionToneDto;
  color: ConditionColorDto | null;
  onPick: (icon: ConditionIconDto) => void;
  /** The icon under the pointer or the focus; `null` when it leaves. */
  onPreview: (icon: ConditionIconDto | null) => void;
}>;

/** A grid of icon buttons in blocks of 280, with one tab stop (the picked icon, else the first)
 *  and the arrows walking it.
 *
 *  Example: `<ConditionIconGrid label="Tabler" icons={tablerIcons} … onPick={choose} />` */
export function ConditionIconGrid(props: ConditionIconGridProps): React.JSX.Element {
  const { icons, value } = props;
  const [shown, setShown] = useState(ICON_GRID_BLOCK);
  const [stop, setStop] = useState(() => Math.max(0, icons.indexOf(value)));
  const grid = useRef<HTMLDivElement>(null);
  const walking = useRef(false);
  const more = (): void => setShown((count) => count + ICON_GRID_BLOCK);
  const visible = icons.slice(0, Math.max(shown, stop + 1));
  // The arrow may step past the drawn block: the focus moves once the tile exists.
  useEffect(() => {
    if (!walking.current) return;
    walking.current = false;
    grid.current?.querySelectorAll('button')[stop]?.focus();
  }, [stop]);
  const walk = (event: React.KeyboardEvent): void => {
    const step = STEP_OF_KEY[event.key];
    if (step === undefined) return;
    event.preventDefault();
    walking.current = true;
    setStop(Math.min(icons.length - 1, Math.max(0, stop + step)));
  };
  return (
    <>
      <div
        ref={grid}
        role="group"
        aria-label={props.label}
        onKeyDown={walk}
        className="grid grid-cols-8 gap-1"
      >
        {visible.map((icon, index) => (
          <IconTile
            key={icon}
            {...props}
            icon={icon}
            tabStop={index === stop}
            onFocusAt={() => setStop(index)}
          />
        ))}
      </div>
      {visible.length < icons.length && <GridEnd onSeen={more} />}
    </>
  );
}

type IconTileProps = ConditionIconGridProps &
  Readonly<{ icon: ConditionIconDto; tabStop: boolean; onFocusAt: () => void }>;

function IconTile({
  icon,
  value,
  tone,
  color,
  tabStop,
  ...events
}: IconTileProps): React.JSX.Element {
  const leave = (): void => events.onPreview(null);
  return (
    <button
      type="button"
      aria-label={conditionIconLabelOf(icon)}
      aria-pressed={icon === value}
      data-icon={icon}
      tabIndex={tabStop ? 0 : -1}
      onClick={() => events.onPick(icon)}
      onMouseEnter={() => events.onPreview(icon)}
      onMouseLeave={leave}
      onFocus={() => {
        events.onFocusAt();
        events.onPreview(icon);
      }}
      onBlur={leave}
      className={cn(
        'grid aspect-square place-items-center rounded-md border border-transparent outline-offset-1 hover:border-border hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
        icon === value && 'border-primary bg-primary/10',
      )}
    >
      <ConditionGlyph icon={icon} tone={tone} color={color} className="size-6" />
    </button>
  );
}

// The line under the last block: in view, the next block comes.
function GridEnd({ onSeen }: Readonly<{ onSeen: () => void }>): React.JSX.Element {
  const end = useRef<HTMLDivElement>(null);
  const seen = useRef(onSeen);
  useEffect(() => {
    seen.current = onSeen;
  });
  useEffect(() => {
    const target = end.current;
    if (!target) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) seen.current();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  return <div ref={end} data-testid="icon-grid-end" aria-hidden="true" className="h-px" />;
}
