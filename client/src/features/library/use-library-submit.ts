import { useState } from 'react';
import { useFetcher } from 'react-router';
import type { LibraryIntent, LibraryOutcome } from './library-intents';

// One fetcher for the whole library: every part submits through it, the browser reads its answer.
const LIBRARY_FETCHER_KEY = 'library';

/** Sends one intent to the library route's `action`; resolves when the list was read again. */
export type LibrarySubmit = (intent: LibraryIntent) => Promise<void>;

/** The library's way to change something on the server (from inside the library route).
 *
 *  Example: `const submit = useLibrarySubmit(); void submit({ intent: 'duplicateScene', sceneId })` */
export function useLibrarySubmit(): LibrarySubmit {
  const fetcher = useFetcher<LibraryOutcome>({ key: LIBRARY_FETCHER_KEY });
  return (intent) => fetcher.submit(intent, { method: 'post', encType: 'application/json' });
}

/** The pending intent (`null` when idle) and the last answer's refusal, for the status line;
 *  `onCreated` runs once per answer that created something (a grid, a copy, a folder).
 *
 *  Example: `const { pending, refusal } = useLibraryOutcome((outcome) => view.select(outcome.createdId))` */
export function useLibraryOutcome(
  onCreated: (intent: LibraryOutcome['intent'], createdId: string) => void,
): Readonly<{ pending: LibraryIntent | null; refusal: string | null }> {
  const fetcher = useFetcher<LibraryOutcome>({ key: LIBRARY_FETCHER_KEY });
  const [seen, setSeen] = useState(fetcher.data);
  if (fetcher.data !== seen) {
    setSeen(fetcher.data);
    if (fetcher.data?.ok && fetcher.data.createdId) {
      onCreated(fetcher.data.intent, fetcher.data.createdId);
    }
  }
  const pending =
    fetcher.state === 'idle' ? null : ((fetcher.json as LibraryIntent | undefined) ?? null);
  const refusal = fetcher.data && !fetcher.data.ok ? fetcher.data.message : null;
  return { pending, refusal };
}
