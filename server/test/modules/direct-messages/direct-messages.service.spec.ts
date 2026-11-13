import { beforeEach, describe, expect, it } from 'vitest';
import {
  DirectMessagesService,
  FRIENDSHIP_MEMORY_MS,
} from '../../../src/modules/direct-messages/direct-messages.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID } from '../../support/campaigns-factories';
import {
  DirectMessagePublisherFake,
  FriendshipExistsFake,
  VisiblePresenceFake,
} from '../../support/direct-messages-fakes';

const NOW = new Date('2026-11-12T12:00:00Z');
const MESSAGE_ID = '7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d';
const ACTION_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

describe('DirectMessagesService', () => {
  let clock: ClockFake;
  let friendships: FriendshipExistsFake;
  let presence: VisiblePresenceFake;
  let publisher: DirectMessagePublisherFake;
  let service: DirectMessagesService;

  beforeEach(() => {
    clock = new ClockFake(NOW);
    friendships = new FriendshipExistsFake();
    friendships.befriend(ANA_ID, BIA_ID);
    presence = new VisiblePresenceFake();
    presence.online.add(ANA_ID).add(BIA_ID).add(CAIO_ID);
    publisher = new DirectMessagePublisherFake();
    service = new DirectMessagesService({
      friendships,
      presence,
      publisher,
      clock,
      newId: () => MESSAGE_ID,
    });
  });

  function sendTo(toUserId: string, from = ANA_ID): Promise<{ messageId: string }> {
    return service.send(from, { actionId: ACTION_ID, toUserId, text: 'oi' });
  }

  it('Ana → Bia: one dm:sent with the new id and the clock, from the session user', async () => {
    expect(await sendTo(BIA_ID)).toEqual({ messageId: MESSAGE_ID });

    expect(publisher.sentEvents).toEqual([
      {
        messageId: MESSAGE_ID,
        fromUserId: ANA_ID,
        toUserId: BIA_ID,
        text: 'oi',
        at: NOW.toISOString(),
      },
    ]);
  });

  it('Ana → Caio (not friends) is refused and nothing goes out', async () => {
    await expect(sendTo(CAIO_ID)).rejects.toMatchObject({ code: 'DM_NOT_FRIENDS' });
    expect(publisher.sentEvents).toEqual([]);
  });

  it('Bia offline → DM_RECIPIENT_OFFLINE', async () => {
    presence.online.delete(BIA_ID);
    await expect(sendTo(BIA_ID)).rejects.toMatchObject({ code: 'DM_RECIPIENT_OFFLINE' });
  });

  it('Ana invisible → DM_SENDER_INVISIBLE', async () => {
    presence.online.delete(ANA_ID);
    await expect(sendTo(BIA_ID)).rejects.toMatchObject({ code: 'DM_SENDER_INVISIBLE' });
  });

  it('to herself → DM_NOT_FRIENDS without reading the database', async () => {
    await expect(sendTo(ANA_ID)).rejects.toMatchObject({ code: 'DM_NOT_FRIENDS' });
    expect(friendships.reads).toBe(0);
  });

  describe('the friendship memory', () => {
    it('a conversation reads the friendship once in the window, both directions', async () => {
      await sendTo(BIA_ID);
      await sendTo(ANA_ID, BIA_ID);
      await sendTo(BIA_ID);

      expect(friendships.reads).toBe(1);
    });

    it('past the window it reads again', async () => {
      await sendTo(BIA_ID);
      clock.current = new Date(NOW.getTime() + FRIENDSHIP_MEMORY_MS);

      await sendTo(BIA_ID);

      expect(friendships.reads).toBe(2);
    });

    it('a saved change of either list forgets the pair: the next message counts it', async () => {
      await sendTo(BIA_ID);
      friendships.unfriend(ANA_ID, BIA_ID);

      await service.friendsChanged({ userIds: [BIA_ID], at: NOW });

      await expect(sendTo(BIA_ID)).rejects.toMatchObject({ code: 'DM_NOT_FRIENDS' });
    });

    it('a change of someone else keeps the pair remembered', async () => {
      await sendTo(BIA_ID);

      await service.friendsChanged({ userIds: [CAIO_ID], at: NOW });
      await sendTo(BIA_ID);

      expect(friendships.reads).toBe(1);
    });
  });

  describe('typing', () => {
    it('Ana typing to Bia reaches Bia only, with the clock', async () => {
      await service.typing(ANA_ID, { toUserId: BIA_ID });

      expect(publisher.typingEvents).toEqual([
        { recipientId: BIA_ID, event: { fromUserId: ANA_ID, at: NOW.toISOString() } },
      ]);
    });

    it.each([
      ['not friends', (): void => undefined, CAIO_ID],
      ['Bia offline', (): void => void presence.online.delete(BIA_ID), BIA_ID],
      ['Ana invisible', (): void => void presence.online.delete(ANA_ID), BIA_ID],
    ] as const)('%s: dropped silently', async (_, arrange, toUserId) => {
      arrange();

      await expect(service.typing(ANA_ID, { toUserId })).resolves.toBeUndefined();
      expect(publisher.typingEvents).toEqual([]);
    });
  });
});
