import { describe, expect, it } from 'vitest';
import { ProfileCardService } from '../../../src/modules/profiles/profile-card.service';
import { ProfileCardNotFoundError } from '../../../src/modules/profiles/profiles.error';
import {
  CardRelationFake,
  cardAccountRow,
  NO_RELATION,
  ProfileCardDaoFake,
  ProfileCardPresenceFake,
  ReputationSummaryFake,
} from '../../support/profile-card-fakes';

const BIA_ID = '3f0c9a8e-1b2d-4e5f-8a6b-7c8d9e0f1a2b';
const CAIO = cardAccountRow();

function serviceWith(overrides: { friends?: boolean; online?: boolean } = {}) {
  const cards = new ProfileCardDaoFake([CAIO]);
  const reputation = new ReputationSummaryFake();
  const online = new Set(overrides.online ? [CAIO.id] : []);
  const service = new ProfileCardService({
    cards,
    friendships: new CardRelationFake({ ...NO_RELATION, friends: overrides.friends ?? false }),
    reputation,
    presence: new ProfileCardPresenceFake(online),
  });
  return { service, cards, reputation };
}

describe('profile card service', () => {
  it('an unknown account throws PROFILE_NOT_FOUND with the id', async () => {
    const { service } = serviceWith();

    await expect(service.cardOf(BIA_ID, BIA_ID)).rejects.toThrow(ProfileCardNotFoundError);
    await expect(service.cardOf(BIA_ID, BIA_ID)).rejects.toThrow(BIA_ID);
  });

  it('asks the reputation as the reader and the common blocks of the pair', async () => {
    const { service, cards, reputation } = serviceWith();

    await service.cardOf(BIA_ID, CAIO.id);

    expect(reputation.asked).toEqual([`${CAIO.id}<-${BIA_ID}`]);
    expect(cards.asked).toEqual([
      `seats:${CAIO.id}`,
      `campaigns:${BIA_ID}:${CAIO.id}`,
      `friends:${BIA_ID}:${CAIO.id}`,
    ]);
  });

  it('a friend online reads online; the same person not a friend reads null', async () => {
    const friend = await serviceWith({ friends: true, online: true }).service.cardOf(
      BIA_ID,
      CAIO.id,
    );
    const stranger = await serviceWith({ online: true }).service.cardOf(BIA_ID, CAIO.id);

    expect([friend.relation, friend.presence]).toEqual(['friend', 'online']);
    expect([stranger.relation, stranger.presence]).toEqual(['none', null]);
  });

  it('reading oneself is self', async () => {
    const card = await serviceWith().service.cardOf(CAIO.id, CAIO.id);

    expect(card.relation).toBe('self');
  });
});
