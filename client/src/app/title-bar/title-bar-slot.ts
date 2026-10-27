import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type TitleBarSlot = Readonly<{
  element: HTMLElement | null;
  setOccupied: (occupied: boolean) => void;
}>;

/** The slot, from the frame down to the pages under it. */
export const TitleBarSlotContext = createContext<TitleBarSlot | null>(null);

/** The slot of the desktop title bar and whether a page put content in it, owned by the frame.
 *
 *  Example: `const slot = useTitleBarSlotState(); <WindowTitleBar slot={slot} … />` */
export function useTitleBarSlotState(): Readonly<{
  slot: TitleBarSlot;
  occupied: boolean;
  setElement: (element: HTMLElement | null) => void;
}> {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [occupied, setOccupied] = useState(false);
  // Stable while the element stays: a new value each render would re-run the pages' effects.
  const slot = useMemo(() => ({ element, setOccupied }), [element]);
  return { slot, occupied, setElement };
}

/** The element of the title bar to portal into while `wanted`, or `null` (a browser, or the page
 *  covered); taking it turns the bar into its room shape.
 *
 *  Example: `const slot = useTitleBarSlot(!covered); slot ? createPortal(top, slot) : top` */
export function useTitleBarSlot(wanted: boolean): HTMLElement | null {
  const slot = useContext(TitleBarSlotContext);
  const element = wanted ? (slot?.element ?? null) : null;
  useEffect(() => {
    if (!slot || !element) return;
    slot.setOccupied(true);
    return () => slot.setOccupied(false);
  }, [slot, element]);
  return element;
}
