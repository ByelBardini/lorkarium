import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readSheetManifestText } from '@/lib/sheet-template-manifest';
import { useSheetTemplateDraft } from '@/features/sheets/use-sheet-template-draft';
import { createSheetTemplateDraftStore } from '@/stores/sheet-template-draft-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TORMENTA_TEMPLATE_ID } from '../../support/sheet-fixtures';
import { SheetTemplatesApiFake } from '../../support/sheet-templates-api-fake';

vi.mock('@/lib/sheet-template-manifest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sheet-template-manifest')>();
  return { ...actual, readSheetManifestText: vi.fn(actual.readSheetManifestText) };
});

const manifestReads = vi.mocked(readSheetManifestText);

async function openedTormenta() {
  const draft = createSheetTemplateDraftStore({
    api: new SheetTemplatesApiFake(),
    campaignId: VHARN.id,
    templateId: TORMENTA_TEMPLATE_ID,
  });
  const view = renderHook(() => useSheetTemplateDraft(draft));
  await waitFor(() => expect(view.result.current.load).toBe('ready'));
  return { draft, view };
}

describe('useSheetTemplateDraft reads the manifest only when it changes', () => {
  beforeEach(() => manifestReads.mockClear());

  it('a key typed in style.css reads the manifest 0 times', async () => {
    const { draft, view } = await openedTormenta();
    manifestReads.mockClear();
    const files = draft
      .getState()
      .draft.files.map((file) =>
        file.path === 'style.css' ? { ...file, content: `${file.content}a` } : file,
      );

    act(() => draft.getState().edit({ files }));

    expect(view.result.current.draft.files).toBe(files);
    expect(manifestReads).not.toHaveBeenCalled();
  });

  it('a key typed in the manifest reads it once and says whether it reads', async () => {
    const { draft, view } = await openedTormenta();
    manifestReads.mockClear();

    act(() => draft.getState().edit({ manifest: '{' }));

    expect(manifestReads).toHaveBeenCalledTimes(1);
    expect(view.result.current.manifestInvalid).toBe(true);
  });
});
