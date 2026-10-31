import type { SheetsApi, SheetsResult } from '@/services/sheets-api';
import { sheetCommandFailureMessage } from '@/features/sheets/sheet-messages';
import type { LibraryIntent } from './library-intents';

/** The library intents that go to the sheets' routes. */
export type SheetIntent = Extract<
  LibraryIntent,
  { intent: 'createSheet' | 'updateSheet' | 'removeSheet' }
>;

export type SheetIntentAnswer =
  | Readonly<{ ok: true; createdId: string | null }>
  | Readonly<{ ok: false; message: string; signedOut: boolean }>;

const ACTION_OF: Readonly<Record<SheetIntent['intent'], string>> = {
  createSheet: 'Criar',
  updateSheet: 'Mudar',
  removeSheet: 'Excluir',
};

/** Whether a library intent is a sheet's. Example: `if (isSheetIntent(intent)) …` */
export function isSheetIntent(intent: LibraryIntent): intent is SheetIntent {
  return (
    intent.intent === 'createSheet' ||
    intent.intent === 'updateSheet' ||
    intent.intent === 'removeSheet'
  );
}

/** Runs a sheet intent of the library (create from the dialog; rename, give, move, show; delete).
 *
 *  Example: `await runSheetIntent(deps.sheetsApi, campaignId, intent)` */
export async function runSheetIntent(
  api: SheetsApi,
  campaignId: string,
  intent: SheetIntent,
): Promise<SheetIntentAnswer> {
  if (intent.intent === 'createSheet') {
    const result = await api.create(campaignId, intent.sheet);
    return result.ok ? { ok: true, createdId: result.value.sheet.id } : refusalOf(intent, result);
  }
  const result =
    intent.intent === 'updateSheet'
      ? await api.update(campaignId, intent.sheetId, intent.changes)
      : await api.remove(campaignId, intent.sheetId, intent.changes);
  return result.ok ? { ok: true, createdId: null } : refusalOf(intent, result);
}

function refusalOf(
  intent: SheetIntent,
  result: Extract<SheetsResult<never>, { ok: false }>,
): SheetIntentAnswer {
  const { failure } = result;
  return {
    ok: false,
    message: sheetCommandFailureMessage(ACTION_OF[intent.intent], failure),
    signedOut: failure.kind === 'unauthenticated',
  };
}
