import { SHEET_TEMPLATE_SOURCE_MAX_BYTES } from '@lorkarium/contracts';
import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import { readSheetManifestText } from '@/lib/sheet-template-manifest';
import type { StoreApi } from 'zustand/vanilla';
import {
  isTemplateDraftDirty,
  sourceBytes,
  type SheetTemplateDraftState,
} from '@/stores/sheet-template-draft-store';
import { sheetTemplateFailureMessage } from './sheet-template-messages';

export type TemplateDraftModel = SheetTemplateDraftState &
  Readonly<{
    bytes: number;
    overBudget: boolean;
    /** The manifest tab holds text the contract refuses: nothing is saved. */
    manifestInvalid: boolean;
    dirty: boolean;
    /** The failure in words, for the editor. */
    problem: string | null;
  }>;

/** The template editor's view of a draft store: starts its first read, and adds the size, the
 *  budget, whether the manifest reads, whether something is unsaved and the failure in words.
 *
 *  Example: `const model = useSheetTemplateDraft(draft); model.save()` */
export function useSheetTemplateDraft(
  draft: StoreApi<SheetTemplateDraftState>,
): TemplateDraftModel {
  const state = useStore(draft);
  useEffect(() => {
    void draft.getState().start();
  }, [draft]);
  const bytes = useMemo(() => sourceBytes(state.draft), [state.draft]);
  // Only a key in the manifest tab changes it: the html, css and js tabs never read it again.
  const manifestInvalid = useMemo(
    () => !readSheetManifestText(state.draft.manifest).ok,
    [state.draft.manifest],
  );
  return {
    ...state,
    bytes,
    overBudget: bytes > SHEET_TEMPLATE_SOURCE_MAX_BYTES,
    manifestInvalid,
    dirty: isTemplateDraftDirty(state),
    problem: state.failure ? sheetTemplateFailureMessage(state.failure) : null,
  };
}
