import type { LibraryMapsApi, LibraryMapsResult } from '@/services/library-maps-api';
import type { LibraryIntent } from './library-intents';
import { libraryMapRefusalMessage } from './library-messages';

/** The library intents that go to the maps' routes. */
export type MapIntent = Extract<
  LibraryIntent,
  { intent: 'updateMap' | 'removeMap' | 'setMainMap' | 'unsetMainMap' }
>;

export type MapIntentAnswer =
  | Readonly<{ ok: true; createdId: null }>
  | Readonly<{ ok: false; message: string; signedOut: boolean }>;

/** Whether a library intent is a map's. Example: `if (isMapIntent(intent)) …` */
export function isMapIntent(intent: LibraryIntent): intent is MapIntent {
  return (
    intent.intent === 'updateMap' ||
    intent.intent === 'removeMap' ||
    intent.intent === 'setMainMap' ||
    intent.intent === 'unsetMainMap'
  );
}

/** Runs a map intent of the library; a map is created by its form, which keeps the image sent.
 *
 *  Example: `await runMapIntent(deps.libraryMapsApi, campaignId, intent)` */
export async function runMapIntent(
  api: LibraryMapsApi,
  campaignId: string,
  intent: MapIntent,
): Promise<MapIntentAnswer> {
  const answer = await sendMapIntent(api, campaignId, intent);
  if (answer.ok) return { ok: true, createdId: null };
  const { failure } = answer;
  return {
    ok: false,
    message: libraryMapRefusalMessage(failure),
    signedOut: failure.kind === 'unauthenticated',
  };
}

function sendMapIntent(
  api: LibraryMapsApi,
  campaignId: string,
  intent: MapIntent,
): Promise<LibraryMapsResult<unknown>> {
  if (intent.intent === 'updateMap') return api.update(campaignId, intent.mapId, intent.changes);
  if (intent.intent === 'removeMap') return api.remove(campaignId, intent.mapId);
  if (intent.intent === 'setMainMap') return api.setMain(campaignId, intent.mapId);
  return api.unsetMain(campaignId, intent.mapId);
}
