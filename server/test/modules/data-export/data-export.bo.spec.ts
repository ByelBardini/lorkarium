import { describe, expect, it } from 'vitest';
import { DataExportBo } from '../../../src/modules/data-export/data-export.bo';

const DAY_MS = 24 * 60 * 60 * 1000;
const BIA_ID = '6f1c1c84-6bd4-4f0e-9d70-3c4f4fbc2a11';
const NOW = new Date('2026-11-19T14:30:00Z');

describe('DataExportBo', () => {
  const rule = new DataExportBo(DAY_MS);

  it('an account that never exported may export now', () => {
    expect(() => rule.requireAllowed(BIA_ID, null, NOW)).not.toThrow();
  });

  it('a last export exactly one interval ago lets the next one out', () => {
    const last = new Date('2026-11-18T14:30:00Z');

    expect(() => rule.requireAllowed(BIA_ID, last, NOW)).not.toThrow();
  });

  it('a second export within the interval is refused with EXPORT_TOO_SOON and the next hour', () => {
    const last = new Date('2026-11-19T10:00:00Z');

    const refusal = (() => {
      try {
        rule.requireAllowed(BIA_ID, last, NOW);
      } catch (error) {
        return error;
      }
      return null;
    })();

    expect(refusal).toMatchObject({
      code: 'EXPORT_TOO_SOON',
      nextAt: new Date('2026-11-20T10:00:00Z'),
      retryAfterSeconds: 70200,
    });
  });

  it('the refusal message cites the account and the next allowed instant', () => {
    const last = new Date('2026-11-19T14:29:59Z');

    expect(() => rule.requireAllowed(BIA_ID, last, NOW)).toThrow(
      `account ${BIA_ID} exported its data at 2026-11-19T14:29:59.000Z: expected one export per interval, next at 2026-11-20T14:29:59.000Z`,
    );
  });

  it('the newest last export that still allows one more is one interval before now', () => {
    expect(rule.latestLastExportAllowedAt(NOW)).toEqual(new Date('2026-11-18T14:30:00Z'));
  });
});
