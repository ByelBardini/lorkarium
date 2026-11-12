import { isHexColor, type HexColorDto } from '@lorkarium/contracts';
import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useCustomColorLock, type CustomColorScope } from './custom-color-locks';
import { CustomColorPanel } from './custom-color-panel';

export type CustomColorTileProps = Readonly<{
  /** The current color: a hex marks the tile; anything else (a palette name, none) leaves "+". */
  value: string | null | undefined;
  /** Called once, by "Usar cor" or by a click on a saved color; never while dragging. */
  onPick: (color: HexColorDto) => void;
  disabled?: boolean;
  /** The background the color will be read on: the panel warns when it reads badly. */
  legibleOn?: HexColorDto;
  /** Another size, when the row around has larger or smaller swatches than `size-7`. */
  className?: string;
  /** Whose plan offers the custom color here (`CustomColorLocksContext`); none = always offered
   *  (a cover tone, a map place). */
  scope?: CustomColorScope;
}>;

const TILE_NAME = 'Cor personalizada';

/** A round swatch after the fixed colors, opening the custom color panel in a popover.
 *
 *  Example: `<CustomColorTile value={color} onPick={setColor} />` */
export function CustomColorTile({
  value,
  onPick,
  disabled,
  legibleOn,
  className,
  scope,
}: CustomColorTileProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const lock = useCustomColorLock(scope);
  const hintId = useId();
  const custom = typeof value === 'string' && isHexColor(value) ? value : null;
  const name = custom === null ? TILE_NAME : `${TILE_NAME}: ${custom}`;
  const pick = (color: HexColorDto): void => {
    setOpen(false);
    onPick(color);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled === true || lock !== null}
        aria-label={name}
        aria-describedby={lock === null ? undefined : hintId}
        title={lock ?? name}
        style={custom === null ? undefined : { background: custom }}
        className={cn(tileLookOf(custom !== null), className)}
      >
        {custom === null && <Plus aria-hidden="true" className="size-3.5" />}
      </PopoverTrigger>
      {lock !== null && (
        <span id={hintId} className="sr-only">
          {lock}
        </span>
      )}
      <PopoverContent aria-label={TILE_NAME} align="start" className="w-72">
        <CustomColorPanel value={custom} onPick={pick} legibleOn={legibleOn} />
      </PopoverContent>
    </Popover>
  );
}

function tileLookOf(marked: boolean): string {
  return cn(
    'flex size-7 shrink-0 items-center justify-center rounded-full transition-colors outline-none',
    'focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40',
    marked
      ? 'ring-2 ring-primary ring-offset-2 ring-offset-panel'
      : 'border border-dashed border-input text-muted-foreground hover:text-foreground',
  );
}
