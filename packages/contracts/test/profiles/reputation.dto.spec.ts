import { describe, expect, it } from 'vitest';
import {
  REPUTATION_MIN_VOTES,
  reputationSummaryDto,
  reputationVoteDto,
} from '../../src/profiles/reputation.dto';

describe('reputationVoteDto', () => {
  it.each([1, -1])('a vote of %s is accepted', (value) => {
    expect(reputationVoteDto.parse({ value })).toEqual({ value });
  });

  it.each([0, 2, '1'])('a vote of %s is refused on the value path', (value) => {
    const result = reputationVoteDto.safeParse({ value });
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['value']);
  });

  it('a voterId in the body is refused because the voter comes from the session (strict)', () => {
    expect(
      reputationVoteDto.safeParse({ value: 1, voterId: '3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d' })
        .success,
    ).toBe(false);
  });
});

describe('reputationSummaryDto', () => {
  it('the minimum of votes before showing a percent is 5', () => {
    expect(REPUTATION_MIN_VOTES).toBe(5);
  });

  it('a summary with no vote of mine and no percent is accepted', () => {
    const summary = { up: 3, down: 1, myVote: null, percent: null };
    expect(reputationSummaryDto.parse(summary)).toEqual(summary);
  });

  it('a negative count is refused on its path', () => {
    const result = reputationSummaryDto.safeParse({ up: -1, down: 0, myVote: 1, percent: null });
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['up']);
  });

  it('a percent above 100 is refused', () => {
    expect(
      reputationSummaryDto.safeParse({ up: 5, down: 0, myVote: null, percent: 101 }).success,
    ).toBe(false);
  });
});
