import { SHEET_TEMPLATE_SOURCE_MAX_BYTES } from '@lorkarium/contracts';
import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
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
    dirty: boolean;
    /** The failure in words, for the editor. */
    problem: string | null;
  }>;

/** The template editor's view of a draft store: starts its first read, and adds the size, the
 *  budget, whether something is unsaved and the failure in words.
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
  return {
    ...state,
    bytes,
    overBudget: bytes > SHEET_TEMPLATE_SOURCE_MAX_BYTES,
    dirty: isTemplateDraftDirty(state),
    problem: state.failure ? sheetTemplateFailureMessage(state.failure) : null,
  };
}
