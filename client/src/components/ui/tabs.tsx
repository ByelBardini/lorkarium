import * as React from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

// Design system: no pill, no box, no shadow; the active tab is marked by a 2px gold underline.

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col', className)} {...props} />
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('flex items-stretch gap-4 border-b border-border', className)}
      {...props}
    />
  );
}

// Radix focuses the trigger by script on mousedown, and Chrome lights `:focus-visible` on a
// scripted focus: a click drew the keyboard ring. The trigger remembers it was pressed until it
// loses focus, and the ring is only for the focus that did not come from a pointer.
function markPointerFocus(event: React.PointerEvent<HTMLButtonElement>): void {
  event.currentTarget.dataset.pointerFocus = '';
}

function clearPointerFocus(event: React.FocusEvent<HTMLButtonElement>): void {
  delete event.currentTarget.dataset.pointerFocus;
}

function TabsTrigger({
  className,
  onPointerDown,
  onBlur,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      onPointerDown={(event) => {
        markPointerFocus(event);
        onPointerDown?.(event);
      }}
      onBlur={(event) => {
        clearPointerFocus(event);
        onBlur?.(event);
      }}
      className={cn(
        'relative -mb-px inline-flex h-10 items-center gap-1.5 border-b-2 border-transparent text-[13px] font-semibold whitespace-nowrap text-muted-foreground outline-offset-2 transition-colors hover:text-foreground focus-visible:not-data-pointer-focus:outline-2 focus-visible:not-data-pointer-focus:outline-ring disabled:pointer-events-none disabled:opacity-50 data-pointer-focus:outline-none data-[state=active]:border-primary data-[state=active]:text-foreground motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('min-h-0 flex-1 outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
