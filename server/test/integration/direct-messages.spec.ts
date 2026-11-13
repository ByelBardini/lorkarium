import {
  dmSendAckDto,
  dmSentDto,
  presenceSyncAckDto,
  type DmSendAckDto,
} from '@lorkarium/contracts';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ackOf, befriend, eventMatching, payloadsOf } from '../support/account-live';
import { silence } from '../support/live-table';
import { recordEventsOf, type EventRecorder } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

async function listening(user: SignedInUser): Promise<EventRecorder> {
  return recordEventsOf(await live.connect(user));
}

async function send(from: EventRecorder, payload: object): Promise<DmSendAckDto> {
  return dmSendAckDto.parse(await ackOf(from.client, 'dm:send', payload));
}

function message(toUserId: string, text = 'oi, Bia'): object {
  return { actionId: randomUUID(), toUserId, text };
}

async function codeOf(from: EventRecorder, payload: object): Promise<string> {
  const ack = await send(from, payload);
  return ack.ok ? 'ok' : ack.error.code;
}

async function invisible(recorder: EventRecorder): Promise<void> {
  const payload = { actionId: randomUUID(), visibility: 'invisible' };
  await ackOf(recorder.client, 'presence:setVisibility', payload);
}

describe('dm:send between friends', () => {
  it('Ana → Bia: every tab of both hears the same dm:sent, with the ack id', async () => {
    await befriend(live, live.ana, live.bia);
    const ana = await listening(live.ana);
    const biaTabs = [await listening(live.bia), await listening(live.bia)];

    const ack = await send(ana, message(live.bia.id));

    expect(ack).toEqual({ ok: true, messageId: expect.any(String) });
    for (const tab of [ana, ...biaTabs]) {
      const sent = dmSentDto.parse(await eventMatching(tab, 'dm:sent'));
      expect(sent).toMatchObject({
        messageId: ack.ok ? ack.messageId : '',
        fromUserId: live.ana.id,
        toUserId: live.bia.id,
        text: 'oi, Bia',
      });
    }
  });

  it('a 2000-character message passes', async () => {
    await befriend(live, live.ana, live.bia);
    const ana = await listening(live.ana);
    await live.connect(live.bia);

    expect(await codeOf(ana, message(live.bia.id, 'a'.repeat(2000)))).toBe('ok');
  });

  it('nothing is written: no insert, update nor delete reaches the database', async () => {
    await befriend(live, live.ana, live.bia);
    const ana = await listening(live.ana);
    await live.connect(live.bia);
    live.queries.reset();

    expect(await codeOf(ana, message(live.bia.id))).toBe('ok');

    expect(live.queries.matching(/^\s*(insert|update|delete)/i)).toBe(0);
  });

  it('the 9th of a burst is RATE_LIMITED, and a presence:sync right after still passes', async () => {
    await befriend(live, live.ana, live.bia);
    const ana = await listening(live.ana);
    await live.connect(live.bia);

    const codes = await Promise.all(
      Array.from({ length: 9 }, () => codeOf(ana, message(live.bia.id))),
    );

    expect(codes.slice(0, 8)).toEqual(Array.from({ length: 8 }, () => 'ok'));
    expect(codes[8]).toBe('RATE_LIMITED');
    const synced = presenceSyncAckDto.parse(await ackOf(ana.client, 'presence:sync'));
    expect(synced.ok).toBe(true);
  });
});

describe('dm:send refused', () => {
  it('Ana → Caio (not friends) → DM_NOT_FRIENDS, and Caio hears nothing', async () => {
    const ana = await listening(live.ana);
    const caio = await listening(live.caio);

    expect(await codeOf(ana, message(live.caio.id))).toBe('DM_NOT_FRIENDS');
    await silence();
    expect(payloadsOf(caio, 'dm:sent')).toEqual([]);
  });

  it('Bia offline and Bia invisible answer the same DM_RECIPIENT_OFFLINE', async () => {
    await befriend(live, live.ana, live.bia);
    const ana = await listening(live.ana);
    expect(await codeOf(ana, message(live.bia.id))).toBe('DM_RECIPIENT_OFFLINE');

    const bia = await listening(live.bia);
    await invisible(bia);

    expect(await codeOf(ana, message(live.bia.id))).toBe('DM_RECIPIENT_OFFLINE');
    expect(payloadsOf(bia, 'dm:sent')).toEqual([]);
  });

  it('Ana invisible → DM_SENDER_INVISIBLE', async () => {
    await befriend(live, live.ana, live.bia);
    const ana = await listening(live.ana);
    await live.connect(live.bia);
    await invisible(ana);

    expect(await codeOf(ana, message(live.bia.id))).toBe('DM_SENDER_INVISIBLE');
  });

  it('after Bia blocks Ana, a conversation already going → DM_NOT_FRIENDS', async () => {
    await befriend(live, live.ana, live.bia);
    const ana = await listening(live.ana);
    await live.connect(live.bia);
    expect(await codeOf(ana, message(live.bia.id))).toBe('ok');

    const blocked = await live.http(live.bia, {
      method: 'POST',
      url: '/api/blocks',
      payload: { userId: live.ana.id },
    });
    expect(blocked.statusCode).toBe(201);

    expect(await codeOf(ana, message(live.bia.id))).toBe('DM_NOT_FRIENDS');
  });

  it('a fromUserId in the payload → INVALID_BODY: the sender is the session', async () => {
    await befriend(live, live.ana, live.bia);
    const ana = await listening(live.ana);
    await live.connect(live.bia);

    const forged = { ...message(live.bia.id), fromUserId: live.caio.id };

    expect(await codeOf(ana, forged)).toBe('INVALID_BODY');
  });
});

describe('dm:typing', () => {
  it('Ana typing reaches Bia as dm:typingFrom, and not Ana herself', async () => {
    await befriend(live, live.ana, live.bia);
    const ana = await listening(live.ana);
    const bia = await listening(live.bia);

    ana.client.emit('dm:typing', { toUserId: live.bia.id });

    expect(await eventMatching(bia, 'dm:typingFrom')).toEqual({
      fromUserId: live.ana.id,
      at: expect.any(String),
    });
    await silence();
    expect(payloadsOf(ana, 'dm:typingFrom')).toEqual([]);
  });

  it('typing to someone who is not a friend drops silently', async () => {
    const ana = await listening(live.ana);
    const caio = await listening(live.caio);

    ana.client.emit('dm:typing', { toUserId: live.caio.id });
    await silence();

    expect(payloadsOf(caio, 'dm:typingFrom')).toEqual([]);
  });
});
