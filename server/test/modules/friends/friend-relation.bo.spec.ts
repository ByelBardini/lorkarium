import { describe, expect, it } from 'vitest';
import {
  FriendRelationBo,
  type FriendRelationState,
} from '../../../src/modules/friends/friend-relation.bo';

const ANA = 'ana-id';
const BIA = 'bia-id';
const LIMITS = { friendsMax: 200, outgoingMax: 50, blocksMax: 200 };

function relation(overrides: Partial<FriendRelationState> = {}): FriendRelationBo {
  return new FriendRelationBo(
    {
      actorId: ANA,
      targetId: BIA,
      friends: false,
      actorAsked: false,
      targetAsked: false,
      actorBlocked: false,
      targetBlocked: false,
      actorFriendCount: 0,
      targetFriendCount: 0,
      actorOutgoingCount: 0,
      actorBlockCount: 0,
      ...overrides,
    },
    LIMITS,
  );
}

describe('FriendRelationBo.request', () => {
  it('without any relation, asking sends and tells both accounts', () => {
    expect(relation().request()).toEqual({ action: 'send', notify: [ANA, BIA] });
  });

  it('when the other one already asked, asking accepts their request', () => {
    expect(relation({ targetAsked: true }).request()).toEqual({
      action: 'accept-incoming',
      notify: [ANA, BIA],
    });
  });

  it('asking oneself is REQUEST_TO_SELF citing the id', () => {
    expect(() => relation({ targetId: ANA }).request()).toThrow(
      expect.objectContaining({ code: 'REQUEST_TO_SELF', message: expect.stringContaining(ANA) }),
    );
  });

  it('asking a friend is ALREADY_FRIENDS', () => {
    expect(() => relation({ friends: true }).request()).toThrow(
      expect.objectContaining({ code: 'ALREADY_FRIENDS' }),
    );
  });

  it('asking twice is REQUEST_ALREADY_SENT', () => {
    expect(() => relation({ actorAsked: true }).request()).toThrow(
      expect.objectContaining({ code: 'REQUEST_ALREADY_SENT' }),
    );
  });

  it('asking someone I blocked is USER_BLOCKED_BY_YOU', () => {
    expect(() => relation({ actorBlocked: true }).request()).toThrow(
      expect.objectContaining({ code: 'USER_BLOCKED_BY_YOU' }),
    );
  });

  it('asking someone who blocked me is kept silently: only I am told', () => {
    expect(relation({ targetBlocked: true }).request()).toEqual({
      action: 'send-silently',
      notify: [ANA],
    });
  });

  it('with 50 pending requests, the 51st is OUTGOING_REQUEST_LIMIT citing "50 of 50"', () => {
    expect(() => relation({ actorOutgoingCount: 50 }).request()).toThrow(
      expect.objectContaining({
        code: 'OUTGOING_REQUEST_LIMIT',
        message: expect.stringContaining('50 of 50'),
      }),
    );
  });

  it('the outgoing ceiling also holds for someone who blocked me (the block is not revealed)', () => {
    expect(() => relation({ actorOutgoingCount: 50, targetBlocked: true }).request()).toThrow(
      expect.objectContaining({ code: 'OUTGOING_REQUEST_LIMIT' }),
    );
  });

  it('with 49 pending requests, one more is still sent', () => {
    expect(relation({ actorOutgoingCount: 49 }).request().action).toBe('send');
  });

  it('with 200 friends, asking is FRIEND_LIMIT citing "200 of 200"', () => {
    expect(() => relation({ actorFriendCount: 200 }).request()).toThrow(
      expect.objectContaining({
        code: 'FRIEND_LIMIT',
        message: expect.stringContaining('200 of 200'),
      }),
    );
  });

  it('a crossed request to someone with 200 friends is FRIEND_LIMIT citing them', () => {
    expect(() => relation({ targetAsked: true, targetFriendCount: 200 }).request()).toThrow(
      expect.objectContaining({ code: 'FRIEND_LIMIT', message: expect.stringContaining(BIA) }),
    );
  });
});

describe('FriendRelationBo.accept', () => {
  it('accepting the request the other one sent tells both', () => {
    expect(relation({ targetAsked: true }).accept()).toEqual({
      action: 'accept',
      notify: [ANA, BIA],
    });
  });

  it('without a request from the other one it is REQUEST_NOT_FOUND', () => {
    expect(() => relation({ actorAsked: true }).accept()).toThrow(
      expect.objectContaining({ code: 'REQUEST_NOT_FOUND' }),
    );
  });

  it('a request from someone I blocked is not seen, so accepting it is REQUEST_NOT_FOUND', () => {
    expect(() => relation({ targetAsked: true, actorBlocked: true }).accept()).toThrow(
      expect.objectContaining({ code: 'REQUEST_NOT_FOUND' }),
    );
  });

  it('with 200 friends, accepting is FRIEND_LIMIT too', () => {
    expect(() => relation({ targetAsked: true, actorFriendCount: 200 }).accept()).toThrow(
      expect.objectContaining({ code: 'FRIEND_LIMIT' }),
    );
  });

  it('with 199 friends, accepting still makes the 200th', () => {
    expect(relation({ targetAsked: true, actorFriendCount: 199 }).accept().action).toBe('accept');
  });
});

describe('FriendRelationBo.withdraw and unfriend', () => {
  it.each([
    ['declining a received request', { targetAsked: true }],
    ['cancelling a sent request', { actorAsked: true }],
  ])('%s tells both accounts', (_case, state) => {
    expect(relation(state).withdraw()).toEqual({ action: 'withdraw', notify: [ANA, BIA] });
  });

  it('cancelling a request to someone who blocked me tells only me', () => {
    expect(relation({ actorAsked: true, targetBlocked: true }).withdraw().notify).toEqual([ANA]);
  });

  it('without any request it is REQUEST_NOT_FOUND', () => {
    expect(() => relation().withdraw()).toThrow(
      expect.objectContaining({ code: 'REQUEST_NOT_FOUND' }),
    );
  });

  it('removing a friend tells both', () => {
    expect(relation({ friends: true }).unfriend()).toEqual({
      action: 'unfriend',
      notify: [ANA, BIA],
    });
  });

  it('removing someone who is not a friend is FRIEND_NOT_FOUND', () => {
    expect(() => relation().unfriend()).toThrow(
      expect.objectContaining({ code: 'FRIEND_NOT_FOUND' }),
    );
  });
});

describe('FriendRelationBo.block and unblock', () => {
  it('blocking a friend ends the friendship and the requests, and the friend sees them go', () => {
    expect(relation({ friends: true }).block()).toEqual({
      action: { endsFriendship: true, dropsRequests: false },
      notify: [ANA, BIA],
    });
  });

  it('blocking someone who asked me drops their request in both directions', () => {
    expect(relation({ targetAsked: true }).block().action).toEqual({
      endsFriendship: false,
      dropsRequests: true,
    });
  });

  it('blocking a stranger tells only me: they never learn of it', () => {
    expect(relation().block().notify).toEqual([ANA]);
  });

  it('blocking oneself is REQUEST_TO_SELF', () => {
    expect(() => relation({ targetId: ANA }).block()).toThrow(
      expect.objectContaining({ code: 'REQUEST_TO_SELF' }),
    );
  });

  it('blocking twice is ALREADY_BLOCKED', () => {
    expect(() => relation({ actorBlocked: true }).block()).toThrow(
      expect.objectContaining({ code: 'ALREADY_BLOCKED' }),
    );
  });

  it('with 200 blocks, one more is BLOCK_LIMIT citing "200 of 200"', () => {
    expect(() => relation({ actorBlockCount: 200 }).block()).toThrow(
      expect.objectContaining({
        code: 'BLOCK_LIMIT',
        message: expect.stringContaining('200 of 200'),
      }),
    );
  });

  it('someone who blocked me can still be blocked back', () => {
    expect(relation({ targetBlocked: true }).block().notify).toEqual([ANA]);
  });

  it('unblocking tells only me and does not bring the friendship back', () => {
    expect(relation({ actorBlocked: true }).unblock()).toEqual({
      action: 'unblock',
      notify: [ANA],
    });
  });

  it('unblocking someone not blocked is BLOCK_NOT_FOUND', () => {
    expect(() => relation().unblock()).toThrow(
      expect.objectContaining({ code: 'BLOCK_NOT_FOUND' }),
    );
  });
});
