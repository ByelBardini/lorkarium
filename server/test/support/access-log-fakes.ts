import type { AccessLogArchivePort } from '../../src/modules/access-log/access-log-archive.port';
import type { AccessRecord } from '../../src/modules/access-log/access-log.bo';
import type { AccessLogFailureLog } from '../../src/modules/access-log/access-log.service';

export type StoredBatch = Readonly<{ key: string; jsonLines: string }>;

/** Keeps every stored batch in memory; `refusing` makes each write fail as a bucket would. */
export class AccessLogArchiveFake implements AccessLogArchivePort {
  readonly batches: StoredBatch[] = [];
  refusing = false;

  async store(key: string, jsonLines: string): Promise<void> {
    if (this.refusing) throw new Error(`archive refused ${key}`);
    if (this.batches.some((batch) => batch.key === key))
      throw new Error(`key written twice: ${key}`);
    this.batches.push({ key, jsonLines });
  }

  /** Every line of every batch, in the order written, parsed back. */
  records(): AccessRecord[] {
    return this.batches.flatMap((batch) => parseJsonLines(batch.jsonLines));
  }
}

/** Collects what the service reported as an error. */
export class AccessLogFailureLogFake implements AccessLogFailureLog {
  readonly errors: { fields: object; message: string }[] = [];

  error(fields: object, message: string): void {
    this.errors.push({ fields, message });
  }
}

function parseJsonLines(jsonLines: string): AccessRecord[] {
  return jsonLines
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as AccessRecord);
}
