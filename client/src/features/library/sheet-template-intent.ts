import type { SheetTemplatesApi, SheetTemplatesResult } from '@/services/sheet-templates-api';
import { sheetTemplateFailureMessage } from '@/features/sheets/sheet-template-messages';
import type { LibraryIntent } from './library-intents';

/** The library intents that go to the sheet templates' routes. */
export type SheetTemplateIntent = Extract<
  LibraryIntent,
  { intent: 'createSheetTemplate' | 'updateSheetTemplate' | 'removeSheetTemplate' }
>;

export type SheetTemplateAnswer =
  | Readonly<{ ok: true; createdId: string | null }>
  | Readonly<{ ok: false; message: string; signedOut: boolean }>;

/** Whether a library intent is a template's. Example: `if (isSheetTemplateIntent(intent)) …` */
export function isSheetTemplateIntent(intent: LibraryIntent): intent is SheetTemplateIntent {
  return (
    intent.intent === 'createSheetTemplate' ||
    intent.intent === 'updateSheetTemplate' ||
    intent.intent === 'removeSheetTemplate'
  );
}

/** Runs a template intent of the library (create from the menu, move by dragging, delete).
 *
 *  Example: `await runSheetTemplateIntent(deps.sheetTemplatesApi, campaignId, intent)` */
export async function runSheetTemplateIntent(
  api: SheetTemplatesApi,
  campaignId: string,
  intent: SheetTemplateIntent,
): Promise<SheetTemplateAnswer> {
  if (intent.intent === 'createSheetTemplate') {
    const result = await api.create(campaignId, intent.template);
    return result.ok ? { ok: true, createdId: result.value.id } : refusalOf(result);
  }
  const result =
    intent.intent === 'updateSheetTemplate'
      ? await api.update(campaignId, intent.templateId, intent.changes)
      : await api.remove(campaignId, intent.templateId);
  return result.ok ? { ok: true, createdId: null } : refusalOf(result);
}

function refusalOf(
  result: Extract<SheetTemplatesResult<never>, { ok: false }>,
): SheetTemplateAnswer {
  const { kind } = result.failure;
  return {
    ok: false,
    message: sheetTemplateFailureMessage(kind),
    signedOut: kind === 'unauthenticated',
  };
}
