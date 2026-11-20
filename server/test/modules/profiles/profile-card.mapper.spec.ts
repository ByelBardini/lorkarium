import { profileCardDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  profileCardPresenceOf,
  profileCardRelationOf,
  toProfileCardDto,
} from '../../../src/modules/profiles/profile-card.mapper';
import { cardAccountRow, cardParts, NO_RELATION } from '../../support/profile-card-fakes';

describe('profile card mapper', () => {
  it('the banner goes out on Lenda and is null on Narrador, Apoiador and Grátis, column kept', () => {
    const cardOn = (plan: 'free' | 'apoiador' | 'narrador' | 'lenda') =>
      toProfileCardDto(cardParts({ account: cardAccountRow({ plan }) })).bannerId;

    expect(cardOn('lenda')).toBe(cardAccountRow().bannerId);
    expect([cardOn('narrador'), cardOn('apoiador'), cardOn('free')]).toEqual([null, null, null]);
  });

  it('an admin on the free plan keeps the banner and the admin seal', () => {
    const card = toProfileCardDto(
      cardParts({ account: cardAccountRow({ plan: 'free', role: 'admin' }) }),
    );

    expect(card.bannerId).not.toBeNull();
    expect(card).toMatchObject({ plan: 'free', admin: true, lorkariumOwner: false });
  });

  it('the seal fields come from accountSealFieldsOf (stored plan, Dono flag)', () => {
    const owner = cardAccountRow({ plan: 'apoiador', lorkariumOwner: true });

    expect(toProfileCardDto(cardParts({ account: owner }))).toMatchObject({
      plan: 'apoiador',
      admin: false,
      lorkariumOwner: true,
    });
  });

  it('a reputation under five votes keeps percent null', () => {
    const reputation = { up: 3, down: 1, myVote: 1 as const, percent: null };

    expect(toProfileCardDto(cardParts({ reputation })).reputation.percent).toBeNull();
  });

  it('presence is null for whoever is not a friend, even online', () => {
    expect(toProfileCardDto(cardParts({ relation: 'none', visiblyOnline: true })).presence).toBe(
      null,
    );
    expect(profileCardPresenceOf('outgoing', true)).toBeNull();
    expect(profileCardPresenceOf('self', true)).toBeNull();
  });

  it('a friend reads online, and invisible reads offline', () => {
    expect(profileCardPresenceOf('friend', true)).toBe('online');
    expect(profileCardPresenceOf('friend', false)).toBe('offline');
  });

  it('the card parses as the contract, with seats and counts', () => {
    const card = toProfileCardDto(
      cardParts({
        seats: { asMaster: 2, asPlayer: 1 },
        account: cardAccountRow({ rollsCount: 40, natural20Count: 3 }),
        mutualFriends: 4,
      }),
    );

    expect(profileCardDto.parse(card)).toMatchObject({
      campaignsAsMaster: 2,
      campaignsAsPlayer: 1,
      rollsCount: 40,
      natural20Count: 3,
      mutualFriends: 4,
    });
  });
});

describe('profile card relation', () => {
  it('reading oneself is self', () => {
    expect(profileCardRelationOf(NO_RELATION, true)).toBe('self');
  });

  it('the reader blocking the other is blocked', () => {
    expect(profileCardRelationOf({ ...NO_RELATION, actorBlocked: true }, false)).toBe('blocked');
  });

  it('friends, outgoing and incoming read as such', () => {
    expect(profileCardRelationOf({ ...NO_RELATION, friends: true }, false)).toBe('friend');
    expect(profileCardRelationOf({ ...NO_RELATION, actorAsked: true }, false)).toBe('outgoing');
    expect(profileCardRelationOf({ ...NO_RELATION, targetAsked: true }, false)).toBe('incoming');
  });

  it('being blocked by the other reads as none', () => {
    const reading = { ...NO_RELATION, targetBlocked: true, targetAsked: true };

    expect(profileCardRelationOf(reading, false)).toBe('none');
  });
});
