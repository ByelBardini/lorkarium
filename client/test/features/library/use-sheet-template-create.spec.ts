import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LibraryIntent } from '@/features/library/library-intents';
import {
  useSheetTemplateCreate,
  type SheetTemplateCreate,
} from '@/features/library/use-sheet-template-create';
import { STARTER_SHEET_SOURCE } from '@/features/sheets/sheet-template-starter';

const FOLDER_ID = '0b9c1f4e-8a7d-4c3b-9e2f-1a2b3c4d5e6f';

class RecordingLibrarySubmit {
  readonly sent: LibraryIntent[] = [];
  readonly order: string[] = [];
  readonly submit = (intent: LibraryIntent): Promise<void> => {
    this.order.push('submit');
    this.sent.push(intent);
    return Promise.resolve();
  };
  readonly beforeCreate = (): void => {
    this.order.push('beforeCreate');
  };
}

function renderCreate(recorder: RecordingLibrarySubmit): SheetTemplateCreate {
  return renderHook(() => useSheetTemplateCreate(recorder.submit, recorder.beforeCreate)).result
    .current;
}

describe('useSheetTemplateCreate', () => {
  it('createSheetTemplate clears the filter first, then sends the starter code into the folder', () => {
    const recorder = new RecordingLibrarySubmit();
    renderCreate(recorder).createSheetTemplate(FOLDER_ID);
    expect(recorder.order).toEqual(['beforeCreate', 'submit']);
    expect(recorder.sent).toEqual([
      { intent: 'createSheetTemplate', template: { folderId: FOLDER_ID, ...STARTER_SHEET_SOURCE } },
    ]);
  });

  it('importSheetTemplate sends the template given untouched and hands back the submit promise', async () => {
    const recorder = new RecordingLibrarySubmit();
    const template = { folderId: null, name: 'Ficha Tormenta', html: '<p>x</p>', css: '', js: '' };
    const sent = renderCreate(recorder).importSheetTemplate(template);
    await expect(sent).resolves.toBeUndefined();
    expect(recorder.order).toEqual(['beforeCreate', 'submit']);
    expect(recorder.sent).toEqual([{ intent: 'createSheetTemplate', template }]);
  });
});
