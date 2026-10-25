import type { AccessRecord } from './access-log.bo';

/** A batch as JSON Lines: one record per line, each ending in a newline, so `zcat | jq` reads the
 *  archived object as it is.
 *
 *  Example: `jsonLinesOf([record]) // '{"kind":"http","at":"2026-10-25T03:04:05.000Z",…}\n'` */
export function jsonLinesOf(records: readonly AccessRecord[]): string {
  return records.map((record) => `${JSON.stringify(record)}\n`).join('');
}
