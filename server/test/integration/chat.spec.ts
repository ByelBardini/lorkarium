import {
  chatSendAckDto,
  chatSentDto,
  diceRollAckDto,
  type ChatSendAckDto,
  type ChatSentDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

const GROUP_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const TABLE = { kind: 'table', whisperTo: null } as const;

type Emit = (event: string, payload: object) => Promise<unknown>;

async function emitParsed(client: RealtimeClient, event: string, payload: object) {
  const timed = client.timeout(4000);
  return (timed.emitWithAck as Emit).call(timed, event, payload);
}

async function say(client: RealtimeClient, payload: object): Promise<ChatSendAckDto> {
  return chatSendAckDto.parse(await emitParsed(client, 'chat:send', payload));
}

function messageOf(table: Pick<Table, 'id'>, extra: object = {}): object {
  const speaker = { kind: 'self' };
  return { ...envelope(table.id), channel: TABLE, speaker, text: 'Abram a porta.', ...extra };
}

function heard(recorder: EventRecorder): ChatSentDto[] {
  return recorder.events
    .filter(({ name }) => name === 'chat:sent')
    .map(({ payload }) => chatSentDto.parse(payload));
}

async function sentOf(recorder: EventRecorder): Promise<ChatSentDto> {
  return chatSentDto.parse(await eventPayload(recorder, 'chat:sent'));
}

// Ana masters Vharn with Bia and Caio; Duda watches it as a spectator.
async function vharnTable(): Promise<{ duda: SignedInUser; clients: RealtimeClient[] }> {
  const duda = await live.signUp('Duda');
  await live.joinAsSpectator(duda, live.vharn);
  const clients = [
    await live.atTable(live.ana, live.vharn),
    await live.atTable(live.bia, live.vharn),
    await live.atTable(live.caio, live.vharn),
    await live.atTable(duda, live.vharn),
  ];
  return { duda, clients };
}

// Lyra, Bia's token on the group grid, created by Ana.
async function lyraSpeaker(ana: RealtimeClient): Promise<object> {
  await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
  const board = await synced(ana, live.vharn);
  return { kind: 'token', sceneId: board.scene.id, tokenId: board.tokens[0]?.id };
}

describe('chat:send — who hears', () => {
  it('Bia on the Table: Ana, Bia, Caio and Duda hear the same message', async () => {
    const { clients } = await vharnTable();
    const recorders = clients.map(recordEventsOf);

    const ack = await say(clients[1]!, messageOf(live.vharn));

    expect(ack).toEqual({ ok: true, messageId: expect.any(String) });
    const events = await Promise.all(recorders.map(sentOf));
    expect(new Set(events.map((event) => JSON.stringify(event))).size).toBe(1);
    expect(events[0]).toMatchObject({
      messageId: ack.ok ? ack.messageId : '',
      fromUserId: live.bia.id,
      channel: TABLE,
      text: 'Abram a porta.',
    });
  });

  it('Bia whispering to Caio: only the two hear it, not Ana (the master) nor Duda', async () => {
    const { clients } = await vharnTable();
    const [ana, bia, caio, duda] = clients.map(recordEventsOf);
    const channel = { kind: 'table', whisperTo: live.caio.id };

    expect(await say(clients[1]!, messageOf(live.vharn, { channel }))).toMatchObject({ ok: true });

    await Promise.all([sentOf(bia!), sentOf(caio!)]);
    await silence();
    expect([ana!, duda!].map(heard)).toEqual([[], []]);
    expect(heard(caio!)[0]?.channel).toEqual(channel);
  });

  it('Caio writing privately to Bia: both hear it under the same ordered pair, Ana does not', async () => {
    const { clients } = await vharnTable();
    const [ana, bia, caio, duda] = clients.map(recordEventsOf);
    const channel = { kind: 'direct', userId: live.bia.id };

    await say(clients[2]!, messageOf(live.vharn, { channel }));

    const pair = [live.bia.id, live.caio.id].sort();
    const events = await Promise.all([sentOf(bia!), sentOf(caio!)]);
    expect(events.map((event) => event.channel)).toEqual([
      { kind: 'direct', userIds: pair },
      { kind: 'direct', userIds: pair },
    ]);
    await silence();
    expect([ana!, duda!].map(heard)).toEqual([[], []]);
  });

  it('a group of Bia, Caio and Duda reaches the three, both tabs of Bia, and not Ana', async () => {
    const { duda, clients } = await vharnTable();
    const biaOtherTab = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const [ana, bia, caio, dudaEvents] = clients.map(recordEventsOf);
    const memberIds = [live.bia.id, live.caio.id, duda.id];
    const channel = { kind: 'group', groupId: GROUP_ID, name: 'Conselho', memberIds };

    await say(clients[1]!, messageOf(live.vharn, { channel }));

    await Promise.all([bia!, biaOtherTab, caio!, dudaEvents!].map(sentOf));
    await silence();
    expect(heard(ana!)).toEqual([]);
    expect(heard(biaOtherTab)[0]?.channel).toEqual(channel);
  });

  it('Duda, the spectator, writes on the Table and receives a direct message', async () => {
    const { duda, clients } = await vharnTable();
    const [ana, , , dudaEvents] = clients.map(recordEventsOf);

    expect(await say(clients[3]!, messageOf(live.vharn))).toMatchObject({ ok: true });
    expect((await sentOf(ana!)).fromUserId).toBe(duda.id);
    const channel = { kind: 'direct', userId: duda.id };
    await say(clients[1]!, messageOf(live.vharn, { channel, text: 'Oi, Duda' }));

    await silence();
    expect(heard(dudaEvents!).map((event) => event.text)).toEqual(['Abram a porta.', 'Oi, Duda']);
  });

  it('who is at Quelm hears nothing of Vharn and cannot write to it (critério 14)', async () => {
    const eli = await live.signUp('Eli');
    await live.joinAsSpectator(eli, live.quelm);
    const bia = await live.atTable(live.bia, live.vharn);
    const quelm = await live.atTable(eli, live.quelm);
    const quelmEvents = recordEventsOf(quelm);

    expect(await say(bia, messageOf(live.vharn))).toMatchObject({ ok: true });
    const outsider = await say(quelm, messageOf(live.vharn));

    expect(outsider).toMatchObject({ ok: false, error: { code: 'CAMPAIGN_NOT_FOUND' } });
    await silence();
    expect(heard(quelmEvents)).toEqual([]);
  });
});

describe('chat:send — speaking as a token', () => {
  it('Bia speaks as Lyra on the Table: everyone hears the name read from the grid', async () => {
    const { clients } = await vharnTable();
    const speaker = await lyraSpeaker(clients[0]!);
    const duda = recordEventsOf(clients[3]!);

    await say(clients[1]!, messageOf(live.vharn, { speaker }));

    expect((await sentOf(duda)).speaker).toEqual({ ...speaker, name: 'Lyra' });
  });

  it.each([
    ['Duda, the spectator', 3],
    ['Caio, who does not control Lyra', 2],
  ])('%s speaking as Lyra is FORBIDDEN and nobody hears it', async (_who, index) => {
    const { clients } = await vharnTable();
    const speaker = await lyraSpeaker(clients[0]!);
    const recorders = clients.map(recordEventsOf);

    const ack = await say(clients[index]!, messageOf(live.vharn, { speaker }));

    expect(ack).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    await silence();
    expect(recorders.flatMap(heard)).toEqual([]);
  });

  it('Bia speaking as Lyra in a whisper is CHAT_SPEAKER_NOT_ALLOWED', async () => {
    const { clients } = await vharnTable();
    const speaker = await lyraSpeaker(clients[0]!);
    const channel = { kind: 'table', whisperTo: live.caio.id };

    expect(await say(clients[1]!, messageOf(live.vharn, { channel, speaker }))).toMatchObject({
      ok: false,
      error: { code: 'CHAT_SPEAKER_NOT_ALLOWED' },
    });
  });
});

describe('chat:send — refusals', () => {
  it('a forged userId is INVALID_BODY', async () => {
    const bia = await live.atTable(live.bia, live.vharn);

    expect(await say(bia, messageOf(live.vharn, { userId: live.ana.id }))).toMatchObject({
      ok: false,
      error: { code: 'INVALID_BODY' },
    });
  });

  it('a whisper to someone of another table is CHAT_RECIPIENT_NOT_MEMBER', async () => {
    const eli = await live.signUp('Eli');
    await live.joinAsSpectator(eli, live.quelm);
    const bia = await live.atTable(live.bia, live.vharn);
    const channel = { kind: 'table', whisperTo: eli.id };

    expect(await say(bia, messageOf(live.vharn, { channel }))).toMatchObject({
      ok: false,
      error: { code: 'CHAT_RECIPIENT_NOT_MEMBER' },
    });
  });

  it('a direct message to oneself and a group without the sender are refused by code', async () => {
    const bia = await live.atTable(live.bia, live.vharn);
    const memberIds = [live.ana.id, live.caio.id];
    const group = { kind: 'group', groupId: GROUP_ID, name: 'Conselho', memberIds };
    const self = { kind: 'direct', userId: live.bia.id };

    const acks = [
      await say(bia, messageOf(live.vharn, { channel: self })),
      await say(bia, messageOf(live.vharn, { channel: group })),
    ];

    expect(acks.map((ack) => (ack.ok ? 'ok' : ack.error.code))).toEqual([
      'CHAT_RECIPIENT_IS_SENDER',
      'CHAT_SENDER_NOT_IN_GROUP',
    ]);
  });

  it('the 9th message of a burst is RATE_LIMITED; the dice bucket is apart and nothing is written', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const before = await synced(ana, live.vharn);

    const acks = await Promise.all(
      Array.from({ length: 9 }, () => say(ana, messageOf(live.vharn))),
    );

    expect(acks.slice(0, 8).every((ack) => ack.ok)).toBe(true);
    expect(acks[8]).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED', retryAfterSeconds: expect.any(Number) },
    });
    expect((await synced(ana, live.vharn)).version).toBe(before.version);
    const parts = [{ label: null, expression: '1d6' }];
    const roll = {
      ...envelope(live.vharn.id),
      label: null,
      parts,
      visibility: 'public',
      aspect: 1,
    };
    const rolled = diceRollAckDto.parse(await emitParsed(ana, 'dice:roll', roll));
    expect(rolled).toMatchObject({ ok: true });
  });
});
