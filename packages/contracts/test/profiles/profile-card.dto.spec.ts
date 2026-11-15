import { describe, expect, it } from 'vitest';
import { profileCardDto, profileCardParamsDto } from '../../src/profiles/profile-card.dto';

function cardOf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '7f1c2a4e-1b2c-4d3e-8f9a-0b1c2d3e4f50',
    username: 'caio',
    name: 'Caio',
    color: 'gold',
    avatarId: null,
    bannerId: null,
    bio: null,
    memberSince: '2026-01-02T03:04:05.000Z',
    plan: 'free',
    admin: false,
    lorkariumOwner: false,
    presence: null,
    relation: 'none',
    rollsCount: 12,
    natural20Count: 1,
    campaignsAsMaster: 0,
    campaignsAsPlayer: 2,
    reputation: { up: 1, down: 0, myVote: 1, percent: null },
    gameSystems: null,
    playSchedule: null,
    contact: null,
    mutualCampaigns: [{ id: '3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d', name: 'Vharn' }],
    mutualFriends: 0,
    ...overrides,
  };
}

function pathsOf(input: unknown): string[] {
  const result = profileCardDto.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) =>
    [...issue.path, ...('keys' in issue ? issue.keys : [])].join('.'),
  );
}

describe('profileCardDto', () => {
  it('a complete card is accepted as is', () => {
    const card = cardOf();
    expect(profileCardDto.parse(card)).toEqual(card);
  });

  it.each(['online', 'offline', null])('presence %s is accepted', (presence) => {
    expect(pathsOf(cardOf({ presence }))).toEqual([]);
  });

  it('presence invisible is refused because invisible is shown as offline', () => {
    expect(pathsOf(cardOf({ presence: 'invisible' }))).toEqual(['presence']);
  });

  it.each(['self', 'friend', 'outgoing', 'incoming', 'blocked', 'none'])(
    'relation %s is accepted',
    (relation) => {
      expect(pathsOf(cardOf({ relation }))).toEqual([]);
    },
  );

  it('a reputation without myVote is refused', () => {
    expect(pathsOf(cardOf({ reputation: { up: 0, down: 0, percent: null } }))).toEqual([
      'reputation.myVote',
    ]);
  });

  it('an email on the card is refused (strict)', () => {
    expect(pathsOf(cardOf({ email: 'caio@x.com' }))).toEqual(['email']);
  });

  it('a negative roll count is refused', () => {
    expect(pathsOf(cardOf({ rollsCount: -1 }))).toEqual(['rollsCount']);
  });
});

describe('profileCardParamsDto', () => {
  it('a non-uuid userId is refused', () => {
    expect(profileCardParamsDto.safeParse({ userId: 'caio' }).success).toBe(false);
  });
});
