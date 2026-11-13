import { memberColorOf } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import type { RelatedAccountRow } from '../../../src/modules/friends/friendships.dao';
import {
  toBlockedUserDto,
  toFriendDto,
  toFriendProfileDto,
  toFriendRelationState,
  toFriendRequestEntryDto,
} from '../../../src/modules/friends/friends.mapper';

const AT = new Date('2026-11-12T20:00:00Z');

function rowOf(overrides: Partial<RelatedAccountRow> = {}): RelatedAccountRow {
  return {
    userId: '6d1f6f8e-4b1a-4c3e-9f7a-0c8d2e1b3a45',
    username: 'bia',
    name: 'Bia',
    colorChoice: null,
    avatarId: null,
    plan: 'free',
    role: 'user',
    lorkariumOwner: false,
    at: AT,
    ...overrides,
  };
}

describe('friends mapper', () => {
  it('an account without a chosen color shows the one drawn from its id', () => {
    const row = rowOf();
    expect(toFriendProfileDto(row).color).toBe(memberColorOf(row.userId, null));
  });

  it('a chosen color is kept, and the admin role becomes the admin flag', () => {
    const profile = toFriendProfileDto(rowOf({ colorChoice: '#336699', role: 'admin' }));
    expect(profile).toMatchObject({ color: '#336699', admin: true });
  });

  it('the profile never carries the role nor the date', () => {
    expect(Object.keys(toFriendProfileDto(rowOf())).sort()).toEqual(
      ['admin', 'avatarId', 'color', 'lorkariumOwner', 'name', 'plan', 'userId', 'username'].sort(),
    );
  });

  it('the date of the relation goes out as ISO: since, request at, block at', () => {
    const iso = AT.toISOString();
    expect(toFriendDto(rowOf()).since).toBe(iso);
    expect(toFriendRequestEntryDto(rowOf()).at).toBe(iso);
    expect(toBlockedUserDto(rowOf()).at).toBe(iso);
  });

  it('the relation state carries both ids and the reading as is', () => {
    const reading = {
      friends: false,
      actorAsked: true,
      targetAsked: false,
      actorBlocked: false,
      targetBlocked: true,
      actorFriendCount: 3,
      targetFriendCount: 4,
      actorOutgoingCount: 5,
      actorBlockCount: 6,
    };
    expect(toFriendRelationState('ana', 'bia', reading)).toEqual({
      actorId: 'ana',
      targetId: 'bia',
      ...reading,
    });
  });
});
