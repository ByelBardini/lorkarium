import { describe, expect, it } from 'vitest';
import {
  SANCTION_RULE_SECTIONS,
  SANCTION_RULES,
  SANCTION_STATEMENT_MAX_LENGTH,
  issueSanctionRequestDto,
  recordAppealRequestDto,
} from '../../src/admin/account-sanction.dto';

const UNTIL = '2026-11-25T15:00:00.000Z';

describe('issueSanctionRequestDto', () => {
  it('a suspension with a rule, a trimmed statement and an end is accepted', () => {
    const body = {
      kind: 'suspension',
      rule: 'harassment',
      statement: '  Ameaçou um jogador no chat da mesa.  ',
      until: UNTIL,
    };
    expect(issueSanctionRequestDto.parse(body)).toEqual({
      kind: 'suspension',
      rule: 'harassment',
      statement: 'Ameaçou um jogador no chat da mesa.',
      until: UNTIL,
    });
  });

  it('a suspension without an end (no deadline) and tied to a report is accepted', () => {
    const reportId = '0b9c3f4e-1d2a-4c5b-8e6f-7a8b9c0d1e2f';
    const body = { kind: 'suspension', rule: 'spam', statement: 'Spam.', reportId };
    expect(issueSanctionRequestDto.parse(body)).toEqual(body);
  });

  it.each(['warning', 'content_removal', 'ban'])(
    'an end on a %s is refused citing the field',
    (kind) => {
      const result = issueSanctionRequestDto.safeParse({
        kind,
        rule: 'spam',
        statement: 'Spam.',
        until: UNTIL,
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['until']);
      expect(result.error?.issues[0]?.message).toMatch(/until .* only with a suspension/);
    },
  );

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['above the maximum', 'x'.repeat(SANCTION_STATEMENT_MAX_LENGTH + 1)],
  ])('a statement %s is refused', (_case, statement) => {
    const body = { kind: 'warning', rule: 'spam', statement };
    expect(issueSanctionRequestDto.safeParse(body).success).toBe(false);
  });

  it('a statement of exactly the maximum is accepted', () => {
    const statement = 'x'.repeat(SANCTION_STATEMENT_MAX_LENGTH);
    const body = { kind: 'warning', rule: 'spam', statement };
    expect(issueSanctionRequestDto.parse(body).statement).toHaveLength(2000);
  });

  it('a rule that is no section of the use policy is refused naming the accepted ones', () => {
    const result = issueSanctionRequestDto.safeParse({
      kind: 'warning',
      rule: 'bad_vibes',
      statement: 'x',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/"bad_vibes".*harassment/);
  });

  it('a forged target or author in the body is refused (strict)', () => {
    const body = { kind: 'warning', rule: 'spam', statement: 'x', issuedBy: 'someone' };
    expect(issueSanctionRequestDto.safeParse(body).success).toBe(false);
  });
});

describe('SANCTION_RULE_SECTIONS', () => {
  it('every rule points at its numbered section of the use policy', () => {
    expect(SANCTION_RULE_SECTIONS.harassment).toEqual({
      section: 2,
      title: 'Respeito às pessoas',
      anchor: '2-respeito-às-pessoas',
    });
    expect(Object.keys(SANCTION_RULE_SECTIONS)).toEqual([...SANCTION_RULES]);
  });
});

describe('recordAppealRequestDto', () => {
  it('the arrival of an appeal is accepted without a note', () => {
    expect(recordAppealRequestDto.parse({ outcome: 'received' })).toEqual({ outcome: 'received' });
  });

  it.each(['upheld', 'reverted'])('the decision %s with a trimmed note is accepted', (outcome) => {
    const parsed = recordAppealRequestDto.parse({ outcome, note: ' Revisto por outra pessoa. ' });
    expect(parsed).toEqual({ outcome, note: 'Revisto por outra pessoa.' });
  });

  it('a decision without a note is refused', () => {
    expect(recordAppealRequestDto.safeParse({ outcome: 'reverted' }).success).toBe(false);
  });

  it('an unknown outcome is refused', () => {
    expect(recordAppealRequestDto.safeParse({ outcome: 'ignored', note: 'x' }).success).toBe(false);
  });
});
