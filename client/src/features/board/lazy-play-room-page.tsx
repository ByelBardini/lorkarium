import { lazy } from 'react';

/** The play room in its own chunk, like the backoffice: the home and the campaign detail never
 *  download the room nor the PixiJS behind it. Render it inside a `Suspense`.
 *
 *  Example: `<Suspense fallback={null}><LazyPlayRoomPage {...props} /></Suspense>` */
export const LazyPlayRoomPage = lazy(async () => ({
  default: (await import('@/features/board/play-room-page')).PlayRoomPage,
}));
