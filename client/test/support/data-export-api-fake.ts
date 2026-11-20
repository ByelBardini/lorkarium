import type { DataExportApi, DataExportResult } from '@/services/data-export-api';
import { ScriptedAnswers } from './scripted-answers';

type Answers = { exportData: DataExportResult };

export const EXPORT_FILE_NAME = 'lorkarium-dados-ana-2026-11-19.zip';

/** A `DataExportApi` in memory: a small ZIP named like the server names it, unless scripted
 *  (`answers.answer('exportData', …)` or `answers.hold('exportData')`). */
export class DataExportApiFake implements DataExportApi {
  readonly archive = new Blob([new Uint8Array([80, 75, 3, 4])], { type: 'application/zip' });
  readonly answers = new ScriptedAnswers<Answers>();

  exportData(): Promise<DataExportResult> {
    return this.answers.reply('exportData', undefined, () => ({
      ok: true,
      value: { fileName: EXPORT_FILE_NAME, blob: this.archive },
    }));
  }
}
