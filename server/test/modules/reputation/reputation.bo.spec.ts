import { describe, expect, it } from 'vitest';
import {
  ReputationVoteBo,
  summarizeReputation,
} from '../../../src/modules/reputation/reputation.bo';
import { ReputationError } from '../../../src/modules/reputation/reputation.error';
import { BIA_ID, CAIO_ID } from '../../support/campaigns-factories';

const MIN_VOTES = 5;

function refusalOf(work: () => void): ReputationError {
  try {
    work();
  } catch (failure) {
    if (failure instanceof ReputationError) return failure;
    throw failure;
  }
  throw new Error('expected a ReputationError, nothing was thrown');
}

describe('ReputationVoteBo.requireAllowed', () => {
  it('voting on oneself is refused citing the id', () => {
    const refusal = refusalOf(() =>
      ReputationVoteBo.requireAllowed({ voterId: BIA_ID, targetId: BIA_ID, shareCampaign: true }),
    );

    expect(refusal.code).toBe('REPUTATION_SELF');
    expect(refusal.message).toContain(BIA_ID);
  });

  it('without a table in common the vote is REPUTATION_NOT_ALLOWED', () => {
    const refusal = refusalOf(() =>
      ReputationVoteBo.requireAllowed({ voterId: BIA_ID, targetId: CAIO_ID, shareCampaign: false }),
    );

    expect(refusal.code).toBe('REPUTATION_NOT_ALLOWED');
    expect(refusal.message).toContain(CAIO_ID);
  });

  it('with a table in common the vote is accepted', () => {
    expect(
      ReputationVoteBo.requireAllowed({ voterId: BIA_ID, targetId: CAIO_ID, shareCampaign: true }),
    ).toBeUndefined();
  });
});

describe('summarizeReputation', () => {
  it('below the minimum of votes the percent is null', () => {
    expect(summarizeReputation({ up: 3, down: 1, myVote: 1 }, MIN_VOTES)).toEqual({
      up: 3,
      down: 1,
      myVote: 1,
      percent: null,
    });
  });

  it('at the minimum the percent is the rounded share of thumbs up', () => {
    expect(summarizeReputation({ up: 2, down: 1, myVote: null }, 3).percent).toBe(67);
  });

  it('every vote down reads 0%, not null', () => {
    expect(summarizeReputation({ up: 0, down: 5, myVote: -1 }, MIN_VOTES).percent).toBe(0);
  });
});
