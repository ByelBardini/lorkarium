import { describe, expect, it } from 'vitest';
import {
  CONDITION_ROUNDS_MAX,
  applyConditionCommandDto,
  defineConditionCommandDto,
} from '../../src/board/condition.dto';

const BASE = {
  actionId: '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a',
  campaignId: '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a',
};
const TOKEN_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const CONDITION_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';

describe('defineConditionCommandDto', () => {
  it('a name padded with spaces is trimmed', () => {
    const parsed = defineConditionCommandDto.parse({ ...BASE, name: '  Sangrando ', tone: 'harm' });
    expect(parsed.name).toBe('Sangrando');
  });

  it.each(['S', 'x'.repeat(32)])('a name of %s characters passes', (name) => {
    expect(defineConditionCommandDto.safeParse({ ...BASE, name, tone: 'harm' }).success).toBe(true);
  });

  it.each(['', '   ', 'x'.repeat(33)])('the name "%s" is refused', (name) => {
    expect(defineConditionCommandDto.safeParse({ ...BASE, name, tone: 'harm' }).success).toBe(
      false,
    );
  });

  it('a tone other than benefit or harm is refused', () => {
    expect(defineConditionCommandDto.safeParse({ ...BASE, name: 'X', tone: 'meh' }).success).toBe(
      false,
    );
  });
});

describe('applyConditionCommandDto', () => {
  const apply = { ...BASE, tokenId: TOKEN_ID, conditionId: CONDITION_ID };

  it('0 rounds (no limit) is accepted', () => {
    expect(applyConditionCommandDto.parse({ ...apply, rounds: 0 }).rounds).toBe(0);
  });

  it(`${CONDITION_ROUNDS_MAX} rounds pass and one more is refused`, () => {
    expect(applyConditionCommandDto.safeParse({ ...apply, rounds: 99 }).success).toBe(true);
    expect(applyConditionCommandDto.safeParse({ ...apply, rounds: 100 }).success).toBe(false);
  });

  it.each([-1, 1.5])('%s rounds is refused', (rounds) => {
    expect(applyConditionCommandDto.safeParse({ ...apply, rounds }).success).toBe(false);
  });
});
