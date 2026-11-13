import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';

/** The library of the room as a place to go to and come back from. */
export type LibraryToggle = Readonly<{
  /** The library is what the address shows. */
  open: boolean;
  /** Opens the library, or goes back to the room when it is open. */
  toggle: () => void;
}>;

/** The library of the table at `/campaigns/:id/table/library`, toggled from the tabs strip and
 *  Shift+B.
 *
 *  Example: `const library = useLibraryToggle(campaign.id); library.toggle()` */
export function useLibraryToggle(campaignId: string): LibraryToggle {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const room = `/campaigns/${encodeURIComponent(campaignId)}/table`;
  const library = `${room}/library`;
  const open = pathname === library;
  // Stable while the address stays: the room's key listener does not bind again each render.
  const toggle = useCallback(
    () => void navigate(open ? room : library),
    [navigate, open, room, library],
  );
  return { open, toggle };
}
