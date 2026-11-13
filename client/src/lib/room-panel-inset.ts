/** What the right edge of the room holds, from the room layout. */
export type RoomPanelEdge = Readonly<{ panel: 'open' | 'closed'; focus: boolean }>;

/** The right inset that keeps something over the board clear of the side panel (360px) and its
 *  rail (46px), beside the board; focus mode draws neither. Literal classes, for Tailwind to see.
 *
 *  Example: `cn('absolute left-0', roomPanelInsetClass(layout)) // … right-[406px]` */
export function roomPanelInsetClass({ panel, focus }: RoomPanelEdge): string {
  if (focus) return 'right-0';
  return panel === 'open' ? 'right-[406px]' : 'right-[46px]';
}
