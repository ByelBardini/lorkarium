import { describe, expect, it } from 'vitest';
import { sameTokensBesidesPose } from '@/features/board/use-board-tokens';
import { kael, lyra } from '../../support/table-session-fixtures';

const TOKENS = [lyra(), kael()];

describe('sameTokensBesidesPose', () => {
  it('a token moved and turned is the same list besides the pose', () => {
    const moved = [{ ...TOKENS[0]!, col: 9, row: 6, facing: 90 }, TOKENS[1]!];

    expect(sameTokensBesidesPose(TOKENS, moved)).toBe(true);
  });

  it('a token renamed is another list', () => {
    const renamed = [TOKENS[0]!, kael({ name: 'Kael, o Velho' })];

    expect(sameTokensBesidesPose(TOKENS, renamed)).toBe(false);
  });

  it('a bar of another identity is another list (the reducer keeps it when untouched)', () => {
    const barred = [TOKENS[0]!, { ...TOKENS[1]!, bars: [] }];

    expect(sameTokensBesidesPose(TOKENS, barred)).toBe(false);
  });

  it('a token more or less is another list', () => {
    expect(sameTokensBesidesPose(TOKENS, [TOKENS[0]!])).toBe(false);
  });

  it('the same tokens in another order is another list', () => {
    expect(sameTokensBesidesPose(TOKENS, [TOKENS[1]!, TOKENS[0]!])).toBe(false);
  });
});
