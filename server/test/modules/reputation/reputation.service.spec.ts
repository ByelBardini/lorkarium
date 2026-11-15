import { describe, expect, it } from 'vitest';
import { ReputationService } from '../../../src/modules/reputation/reputation.service';
import { BIA_ID, CAIO_ID, DUDA_ID } from '../../support/campaigns-factories';
import { ActiveAccountsFake, ReputationDaoFake } from '../../support/reputation-fakes';

const GONE_ID = '00000000-0000-4000-8000-000000000000';

function serviceOver(): { service: ReputationService; votes: ReputationDaoFake } {
  const votes = new ReputationDaoFake();
  const accounts = new ActiveAccountsFake([BIA_ID, CAIO_ID, DUDA_ID]);
  votes.seatTogether(BIA_ID, CAIO_ID);
  return { votes, service: new ReputationService({ votes, accounts, minVotes: 2 }) };
}

describe('ReputationService.vote', () => {
  it('a repeated vote changes the value instead of adding another', async () => {
    const { service, votes } = serviceOver();

    await service.vote(BIA_ID, CAIO_ID, 1);
    await service.vote(BIA_ID, CAIO_ID, -1);

    expect(votes.votes).toEqual([{ voterId: BIA_ID, targetId: CAIO_ID, value: -1 }]);
  });

  it('without a table in common nothing is written', async () => {
    const { service, votes } = serviceOver();

    await expect(service.vote(BIA_ID, DUDA_ID, 1)).rejects.toMatchObject({
      code: 'REPUTATION_NOT_ALLOWED',
    });
    expect(votes.journal).toEqual([]);
  });

  it('an inactive or unknown target is REPUTATION_TARGET_NOT_FOUND', async () => {
    const { service } = serviceOver();

    await expect(service.vote(BIA_ID, GONE_ID, 1)).rejects.toMatchObject({
      code: 'REPUTATION_TARGET_NOT_FOUND',
    });
  });
});

describe('ReputationService.removeVote', () => {
  it('removing twice is idempotent and leaves no vote', async () => {
    const { service, votes } = serviceOver();
    await service.vote(BIA_ID, CAIO_ID, 1);

    await service.removeVote(BIA_ID, CAIO_ID);
    await service.removeVote(BIA_ID, CAIO_ID);

    expect(votes.votes).toEqual([]);
  });

  it('removing needs no table in common anymore', async () => {
    const { service, votes } = serviceOver();

    await service.removeVote(BIA_ID, DUDA_ID);

    expect(votes.journal).toEqual(['remove']);
  });
});

describe('ReputationService.summaryOf', () => {
  it("the viewer's own vote is myVote; another viewer sees null", async () => {
    const { service } = serviceOver();
    await service.vote(BIA_ID, CAIO_ID, 1);

    expect(await service.summaryOf(CAIO_ID, BIA_ID)).toMatchObject({ up: 1, myVote: 1 });
    expect(await service.summaryOf(CAIO_ID, DUDA_ID)).toMatchObject({ up: 1, myVote: null });
  });
});
