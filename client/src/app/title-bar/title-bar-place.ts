import type { UIMatch } from 'react-router';

/** What a route tells the desktop title bar: where the person is ("Suas mesas"). */
export type PlaceHandle = Readonly<{ place: string }>;

/** The place of the deepest matched route that has one, or `null`.
 *
 *  Example: `<WindowTitleBar place={placeOf(useMatches())} … />` */
export function placeOf(matches: readonly UIMatch[]): string | null {
  const withPlace = matches.map((match) => match.handle).filter(isPlaceHandle);
  return withPlace.at(-1)?.place ?? null;
}

function isPlaceHandle(handle: unknown): handle is PlaceHandle {
  return (
    typeof handle === 'object' &&
    handle !== null &&
    'place' in handle &&
    typeof handle.place === 'string'
  );
}
