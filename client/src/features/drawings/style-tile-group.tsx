import { useId } from 'react';
import { cn } from 'cn';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';

export type StyleTile<T extends string> = Readonly<{
  value: T;
  /** The accessible name and the hover title: the tile itself shows only a picture. */
  label: string;
  picture: React.ReactNode;
}>;

export type StyleTileGroupProps<T extends string> = Readonly<{
  legend: string;
  value: T;
  tiles: readonly StyleTile<T>[];
  onChange: (value: T) => void;
  /** `round` for color swatches, `square` for icon buttons (the Excalidraw/tldraw toolbar look). */
  shape: 'round' | 'square';
  disabled?: boolean;
  hint?: string;
}>;

const TILE_SHAPE = {
  round: 'size-7 rounded-full',
  square: 'h-8 flex-1 rounded-md bg-input/30 hover:bg-input/60',
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
}: StyleTileGroupProps<T>): React.JSX.Element {
  const groupId = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend id={`${groupId}-legend`} className="mb-2 text-[13px] text-label">
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
        className={cn('flex gap-2', shape === 'round' && 'flex-wrap')}
      >
        {tiles.map((tile) => (
          <RadioGroupPrimitive.Item
            key={tile.value}
            value={tile.value}
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
