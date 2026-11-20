import { describe, expect, it } from 'vitest';
import { MailBroadcastBo } from '../../../src/modules/broadcasts/mail-broadcast.bo';

const TESTED = new Date('2026-11-19T12:00:00Z');
const draft = { id: 'b-1', testedAt: TESTED, confirmedAt: null };

function codeOf(run: () => void): string | undefined {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe('MailBroadcastBo', () => {
  it('a tested draft by an admin with 2FA on can be confirmed', () => {
    expect(() => new MailBroadcastBo(draft).requireConfirmable(true)).not.toThrow();
  });

  it('an admin without 2FA on is refused with TWO_FACTOR_REQUIRED', () => {
    expect(codeOf(() => new MailBroadcastBo(draft).requireConfirmable(false))).toBe(
      'TWO_FACTOR_REQUIRED',
    );
  });

  it('a draft never tested is refused with TEST_REQUIRED', () => {
    const untested = new MailBroadcastBo({ ...draft, testedAt: null });
    expect(codeOf(() => untested.requireConfirmable(true))).toBe('TEST_REQUIRED');
  });

  it('confirming twice is refused with ALREADY_CONFIRMED, before any other lock', () => {
    const confirmed = new MailBroadcastBo({ ...draft, testedAt: null, confirmedAt: TESTED });
    expect(codeOf(() => confirmed.requireConfirmable(false))).toBe('ALREADY_CONFIRMED');
  });

  it('a confirmed notice can no longer be rewritten nor tested (ALREADY_CONFIRMED)', () => {
    const confirmed = new MailBroadcastBo({ ...draft, confirmedAt: TESTED });
    expect(codeOf(() => confirmed.requireDraft())).toBe('ALREADY_CONFIRMED');
  });

  it('a draft can be rewritten', () => {
    expect(() => new MailBroadcastBo(draft).requireDraft()).not.toThrow();
  });

  it('the typed total equal to the frozen audience passes', () => {
    expect(() => MailBroadcastBo.requireTypedTotal(1240, 1240)).not.toThrow();
  });

  it('a typed total different from the frozen audience is refused citing the expected one', () => {
    const run = () => MailBroadcastBo.requireTypedTotal(1240, 1241);
    expect(run).toThrow(expect.objectContaining({ code: 'CONFIRMATION_MISMATCH' }));
    expect(run).toThrow(/1240.*1241/);
  });
});
