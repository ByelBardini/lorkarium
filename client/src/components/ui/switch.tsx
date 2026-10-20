import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

// Design system: no shadow; on is the gold accent, the knob turns dark on it. The pill is the
// shape that says "on/off", the one exception besides the radio.

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-6 w-[42px] shrink-0 items-center rounded-full bg-input p-[3px] outline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary motion-reduce:transition-none',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-[18px] rounded-full bg-muted-foreground transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-primary-foreground motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
