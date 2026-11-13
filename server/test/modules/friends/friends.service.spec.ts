import { beforeEach, describe, expect, it } from 'vitest';
import { FriendsService } from '../../../src/modules/friends/friends.service';
import { ClockFake } from '../../support/auth-fakes';
import {
  ForgottenMembershipsFake,
  FriendsChangedFake,
  FriendsStoreFake,
  MemberRemovedFake,
} from '../../support/friends-fakes';

const NOW = new Date('2026-11-12T20:00:00Z');
const ANA = { id: 'a-ana', username: 'ana', name: 'Ana' };
const BIA = { id: 'b-bia', username: 'bia', name: 'Bia' };
const CAIO = { id: 'c-caio', username: 'caio', name: 'Caio' };
const LIMITS = { friendsMax: 200, outgoingMax: 50, blocksMax: 200 };

describe('FriendsService', () => {
  let store: FriendsStoreFake;
  let changed: FriendsChangedFake;
  let removed: MemberRemovedFake;
  let memberships: ForgottenMembershipsFake;
  let service: FriendsService;

  beforeEach(() => {
    store = new FriendsStoreFake([ANA, BIA, CAIO]);
    changed = new FriendsChangedFake();
    removed = new MemberRemovedFake();
    memberships = new ForgottenMembershipsFake();
    const accounts = {
      findByUsername: async (username: string) =>
        [ANA, BIA, CAIO].find((account) => account.username === username) as never,
    };
    service = new FriendsService({
      ...{ reads: store.daos, accounts, transaction: store.run, changed, removed, memberships },
      clock: new ClockFake(NOW),
      limits: LIMITS,
    });
  });

  function toldAccounts(): string[][] {
    return changed.changes.map((change) => [...change.userIds]);
  }

  it('a request by @ is saved at the clock instant and tells both accounts', async () => {
    expect(await service.request(ANA.id, 'bia')).toEqual({ outcome: 'sent' });

    expect(store.requests).toEqual([{ fromId: ANA.id, toId: BIA.id, at: NOW }]);
    expect(changed.changes).toEqual([{ userIds: [ANA.id, BIA.id], at: NOW }]);
  });

  it('the pair is locked before anything is decided, in id order', async () => {
    await service.request(BIA.id, 'ana');

    expect(store.locks).toEqual([[ANA.id, BIA.id]]);
  });

  it('a crossed request becomes the friendship and drops both requests', async () => {
    await service.request(BIA.id, 'ana');

    expect(await service.request(ANA.id, 'bia')).toEqual({ outcome: 'accepted' });

    expect(store.requests).toEqual([]);
    expect(store.friendships).toHaveLength(1);
  });

  it('accepting tells both and answers the friend with since', async () => {
    await service.request(BIA.id, 'ana');

    const friend = await service.accept(ANA.id, BIA.id);

    expect(friend).toMatchObject({ userId: BIA.id, username: 'bia', since: NOW.toISOString() });
    expect(toldAccounts().at(-1)).toEqual([ANA.id, BIA.id]);
  });

  it('a request to someone who blocked me answers sent, is kept, and only I am told', async () => {
    await service.block(CAIO.id, { userId: ANA.id });
    changed.changes.length = 0;

    expect(await service.request(ANA.id, 'caio')).toEqual({ outcome: 'sent' });

    expect(store.requests).toHaveLength(1);
    expect(toldAccounts()).toEqual([[ANA.id]]);
    expect((await service.overview(CAIO.id)).incoming).toEqual([]);
    expect((await service.overview(ANA.id)).outgoing).toHaveLength(1);
  });

  it('an unknown @ is USER_NOT_FOUND citing it, with nothing locked nor told', async () => {
    await expect(service.request(ANA.id, 'naoexiste')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      message: expect.stringContaining('@naoexiste'),
    });
    expect(store.locks).toEqual([]);
    expect(changed.changes).toEqual([]);
  });

  it('blocking by an id that does not exist is USER_NOT_FOUND', async () => {
    await expect(service.block(ANA.id, { userId: 'z-nobody' })).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });

  it('a refusal of the BO writes nothing and tells nobody', async () => {
    await expect(service.withdraw(ANA.id, BIA.id)).rejects.toMatchObject({
      code: 'REQUEST_NOT_FOUND',
    });
    expect(changed.changes).toEqual([]);
  });

  it('removing a friend deletes the pair and tells both', async () => {
    await service.request(BIA.id, 'ana');
    await service.accept(ANA.id, BIA.id);

    await service.unfriend(BIA.id, ANA.id);

    expect(store.friendships).toEqual([]);
    expect(toldAccounts().at(-1)).toEqual([BIA.id, ANA.id]);
  });

  it('blocking a friend ends the friendship and the friend is told', async () => {
    await service.request(BIA.id, 'ana');
    await service.accept(ANA.id, BIA.id);

    const blocked = await service.block(ANA.id, { username: 'bia' });

    expect(blocked).toMatchObject({ userId: BIA.id, at: NOW.toISOString() });
    expect(store.friendships).toEqual([]);
    expect(toldAccounts().at(-1)).toEqual([ANA.id, BIA.id]);
  });

  it('blocking takes the target out of the tables I own, forgets the seat and tells the table', async () => {
    store.seats.push(
      { campaignId: 'vharn', ownerId: ANA.id, userId: CAIO.id },
      { campaignId: 'quelm', ownerId: BIA.id, userId: CAIO.id },
    );

    await service.block(ANA.id, { userId: CAIO.id });

    expect(removed.removals).toEqual([{ campaignId: 'vharn', userId: CAIO.id }]);
    expect(memberships.forgotten).toEqual([`vharn:${CAIO.id}`]);
    expect(store.seats).toEqual([{ campaignId: 'quelm', ownerId: BIA.id, userId: CAIO.id }]);
  });

  it('unblocking removes the block, brings no friendship back and tells only me', async () => {
    await service.block(ANA.id, { userId: CAIO.id });

    await service.unblock(ANA.id, CAIO.id);

    expect(store.blocks).toEqual([]);
    expect(store.friendships).toEqual([]);
    expect(toldAccounts().at(-1)).toEqual([ANA.id]);
  });

  it('the overview maps the four lists with the effective color', async () => {
    await service.request(BIA.id, 'ana');
    await service.request(ANA.id, 'caio');

    const overview = await service.overview(ANA.id);

    expect(overview.incoming).toEqual([
      expect.objectContaining({ userId: BIA.id, at: NOW.toISOString() }),
    ]);
    expect(overview.outgoing).toEqual([expect.objectContaining({ userId: CAIO.id })]);
    expect(overview.incoming[0]?.color).toMatch(/^[a-z]+$/);
    expect(overview).toMatchObject({ friends: [], blocked: [] });
  });
});
