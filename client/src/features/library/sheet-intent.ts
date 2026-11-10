import type { SheetsApi, SheetsResult } from '@/services/sheets-api';
import type { SheetWriteResponseDto } from '@lorkarium/contracts';
import { sheetCommandFailureMessage, skippedBarsNotice } from '@/features/sheets/sheet-messages';
import type { LibraryIntent } from './library-intents';

/** The library intents that go to the sheets' routes. */
export type SheetIntent = Extract<
  LibraryIntent,
  { intent: 'createSheet' | 'updateSheet' | 'removeSheet' }
>;

export type SheetIntentAnswer =
  | Readonly<{ ok: true; createdId: string | null; notice: string | null }>
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
 *  A sheet given with template bars that did not fit its holder comes back with the notice.
 *
 *  Example: `await runSheetIntent(deps.sheetsApi, campaignId, intent)` */
export async function runSheetIntent(
  api: SheetsApi,
  campaignId: string,
  intent: SheetIntent,
): Promise<SheetIntentAnswer> {
  if (intent.intent === 'createSheet') {
    const result = await api.create(campaignId, intent.sheet);
    return result.ok
      ? writtenAnswer(result.value, result.value.sheet.id)
      : refusalOf(intent, result);
  }
  if (intent.intent === 'updateSheet') {
    const result = await api.update(campaignId, intent.sheetId, intent.changes);
    return result.ok ? writtenAnswer(result.value, null) : refusalOf(intent, result);
  }
  const result = await api.remove(campaignId, intent.sheetId, intent.changes);
  return result.ok ? { ok: true, createdId: null, notice: null } : refusalOf(intent, result);
}

function writtenAnswer(
  written: SheetWriteResponseDto,
  createdId: string | null,
): SheetIntentAnswer {
  return { ok: true, createdId, notice: skippedBarsNotice(written.receipt.skippedBars) };
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
