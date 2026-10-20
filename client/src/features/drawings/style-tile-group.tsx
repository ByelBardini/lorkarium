import { useId } from 'react';
import { cn } from 'cn';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';

export type StyleTile<T extends string> = Readonly<{
  value: T;
  /** The accessible name and the hover title: the tile itself shows only a picture. */
  label: string;
  picture: React.ReactNode;
  /** This tile alone cannot be picked (the rest of the group can). */
  disabled?: boolean;
}>;

export type StyleTileGroupProps<T extends string> = Readonly<{
  legend: string;
  /** `null` checks no tile (the lights picked differ); the arrows still walk the tiles. */
  value: T | null;
  tiles: readonly StyleTile<T>[];
  onChange: (value: T) => void;
  /** `round` for color swatches, `square` for icon buttons (the Excalidraw/tldraw toolbar look),
   *  `grid` for many fixed-size icon buttons that wrap. */
  shape: 'round' | 'square' | 'grid';
  disabled?: boolean;
  hint?: string;
  /** The legend only for screen readers, where a row has no room for it (the bars of a token). */
  legendHidden?: boolean;
}>;

const TILE_SHAPE = {
  round: 'size-7 rounded-full',
  square: 'h-8 flex-1 rounded-md bg-input/30 hover:bg-input/60',
  grid: 'size-8 rounded-md bg-input/30 hover:bg-input/60',
} as const;

/** A radio group drawn as a row of picture tiles: the checked one gets a gold ring.
 *
 *  Example: `<StyleTileGroup legend="Cor" value={c} tiles={SWATCHES} onChange={setC} shape="round" />` */
export function StyleTileGroup<T extends string>({
  legend,
  value,
  tiles,
  onChange,
  shape,
  disabled,
  hint,
  legendHidden,
}: StyleTileGroupProps<T>): React.JSX.Element {
  const groupId = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend
        id={`${groupId}-legend`}
        className={legendHidden ? 'sr-only' : 'mb-2 text-[13px] text-label'}
      >
        {legend}
      </legend>
      <RadioGroupPrimitive.Root
        aria-labelledby={`${groupId}-legend`}
        aria-describedby={hint ? `${groupId}-hint` : undefined}
        disabled={disabled}
        value={value}
        onValueChange={(next) => {
          const chosen = tiles.find((tile) => tile.value === next);
          if (chosen) onChange(chosen.value);
        }}
        className={cn('flex gap-2', shape !== 'square' && 'flex-wrap')}
      >
        {tiles.map((tile) => (
          <RadioGroupPrimitive.Item
            key={tile.value}
            value={tile.value}
            disabled={tile.disabled}
            aria-label={tile.label}
            title={tile.label}
            className={cn(
              'flex cursor-pointer items-center justify-center text-muted-foreground transition-colors outline-none',
              'focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40',
              'data-[state=checked]:text-primary data-[state=checked]:ring-2 data-[state=checked]:ring-primary',
              shape === 'round' &&
                'data-[state=checked]:ring-offset-2 data-[state=checked]:ring-offset-panel',
              TILE_SHAPE[shape],
            )}
          >
            {tile.picture}
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
      {hint && (
        <p id={`${groupId}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </fieldset>
  );
}
