import * as React from 'react';
import { Slider as SliderPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

// Written by hand over the `radix-ui` already in the project, like the switch (the shadcn CLI would
// add a package). Design system: no shadow; the filled part is the gold accent, the thumb a dark
// knob ringed in gold, the focus the same outline as the other controls.

// The role="slider" is the thumb's: its name and spoken value go there, not on the root.
type SliderProps = React.ComponentProps<typeof SliderPrimitive.Root> &
  Readonly<{ 'aria-valuetext'?: string }>;

function Slider({
  className,
  'aria-label': label,
  'aria-labelledby': labelledBy,
  'aria-valuetext': valueText,
  ...props
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-input"
      >
        <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-valuetext={valueText}
        className="block size-4 rounded-full border-2 border-primary bg-panel outline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
      />
    </SliderPrimitive.Root>
  );
}

export { Slider };
