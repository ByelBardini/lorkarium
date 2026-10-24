import { useEffect, useState } from 'react';

const SAVED_NOTICE_MS = 2000;

/** What a save bar says: an edit waits, it is being saved, or it was just saved (for 2 s). */
export type UnsavedChangesState = 'dirty' | 'saving' | 'saved';

/** The state of the save bar, or `null` when it has nothing to say (and hides).
 *
 *  Example: `unsavedChangesStateOf({ saving: false, dirty: true, justSaved: false }) // 'dirty'` */
export function unsavedChangesStateOf(
  flags: Readonly<{ saving: boolean; dirty: boolean; justSaved: boolean }>,
): UnsavedChangesState | null {
  if (flags.saving) return 'saving';
  if (flags.dirty) return 'dirty';
  return flags.justSaved ? 'saved' : null;
}

/** "Tudo salvo." for 2 s after a save: `showSaved()` turns it on, a timer turns it off.
 *
 *  Example: `const notice = useSavedNotice(); onDone(() => notice.showSaved())` */
export function useSavedNotice(): Readonly<{ justSaved: boolean; showSaved: () => void }> {
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), SAVED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [justSaved]);
  return { justSaved, showSaved: () => setJustSaved(true) };
}
