import { cn } from '@/lib/utils';

/** Classes of a rail link; the active item is a gold stroke on the left edge, not a filled box.
 *  A string on purpose: the tooltip's Slot (asChild) stringifies NavLink's className function.
 *
 *  Example: `<NavLink className={railLinkClass(useMatch(to) !== null, expanded)} />` */
export function railLinkClass(isActive: boolean, expanded: boolean): string {
  return cn(
    'relative flex h-10 items-center gap-3 rounded-lg text-sm font-medium text-muted-foreground no-underline hover:bg-muted hover:text-foreground hover:no-underline',
    expanded ? 'px-3' : 'justify-center',
    isActive &&
      'text-foreground before:absolute before:inset-y-2 before:-left-2 before:w-0.5 before:bg-primary',
  );
}
