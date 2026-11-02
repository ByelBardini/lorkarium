import { beforeEach, describe, expect, it } from 'vitest';
import {
  RealtimeTableSessionApi,
  type CharacterUpdate,
  type CharactersHandle,
  type TableSessionHandle,
} from '@/services/table-session-api';
import { QUELM, VHARN } from '../support/campaigns-api-fake';
import {
  LYRA_CHARACTER_ID,
  characterChanged,
  characterRemoved,
  lyraCharacter,
} from '../support/character-fixtures';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { conditionDefinition, vharnBoard, vharnState } from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const SYNC = 'character:sync';
const poisoned = conditionDefinition();
const TABLE_EVENT = { campaignId: VHARN.id, version: 4, at: '2026-10-31T12:00:00.000Z' };

describe('the table stream of a table visit', () => {
  let transport: RealtimeTransportFake;
  let updates: CharacterUpdate[];
  let handle: TableSessionHandle;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    updates = [];
    handle = new RealtimeTableSessionApi(transport, () => ACTION_ID).open(
      VHARN.id,
      () => undefined,
    );
  });

  function follow(): CharactersHandle {
    return handle.followCharacters((update) => updates.push(update));
  }

  async function joined(): Promise<void> {
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck({ ok: true, state: vharnState() });
    await transport.answerAck({ ok: true, state: vharnBoard() }, 'board:sync');
  }

  function syncsSent(): number {
    return transport.sent.filter(({ event }) => event === SYNC).length;
  }

  it('after the join and the group sync, asks character:sync with only the table and hands over the characters and the condition list', async () => {
    follow();
    await joined();
    expect(transport.sent.at(-1)).toEqual({ event: SYNC, payload: { campaignId: VHARN.id } });
    const sync = { version: 3, characters: [lyraCharacter()], conditionDefinitions: [poisoned] };
    await transport.answerAck({ ok: true, ...sync }, SYNC);
    expect(updates).toEqual([{ kind: 'characters', sync }]);
  });

  it('following once the table is joined asks the sync at once', async () => {
    await joined();
    follow();
    expect(syncsSent()).toBe(1);
  });

  it('nobody following asks nothing', async () => {
    await joined();
    expect(syncsSent()).toBe(0);
  });

  it.each([
    [{ ok: false, error: { code: 'CAMPAIGN_NOT_FOUND', message: 'x' } }, 'not_found'],
    [{ ok: true, version: 3 }, 'unexpected'],
    [{ ok: true, version: 3, characters: [] }, 'unexpected'],
  ])('a sync answered %j fails as %s', async (answer, failure) => {
    follow();
    await joined();
    await transport.answerAck(answer, SYNC);
    expect(updates).toEqual([{ kind: 'charactersFailed', failure }]);
  });

  it('a sync with no answer in time is offline', async () => {
    follow();
    await joined();
    await transport.timeOutAck(SYNC);
    expect(updates).toEqual([{ kind: 'charactersFailed', failure: 'offline' }]);
  });

  it('character:changed and character:removed of this table reach the listener', () => {
    follow();
    transport.serverEmits('character:changed', characterChanged(4, lyraCharacter()));
    transport.serverEmits('character:removed', characterRemoved(5));
    expect(updates).toEqual([
      { kind: 'characterChanged', event: characterChanged(4, lyraCharacter()) },
      { kind: 'characterRemoved', event: characterRemoved(5, LYRA_CHARACTER_ID) },
    ]);
  });

  it.each([
    ['condition:defined', 'conditionDefined', { definition: poisoned }],
    ['condition:definitionUpdated', 'conditionDefinitionUpdated', { definition: poisoned }],
    ['condition:definitionDeleted', 'conditionDefinitionDeleted', { conditionId: poisoned.id }],
    ['condition:defaultsRestored', 'conditionDefaultsRestored', { definitions: [poisoned] }],
  ])('%s of this table reaches the listener as %s', (name, kind, fields) => {
    follow();
    const event = { ...TABLE_EVENT, ...fields };
    transport.serverEmits(name, event);
    expect(updates).toEqual([{ kind, event }]);
  });

  it('a condition event that names a grid (the shape of before the table stream) asks the sync again', async () => {
    follow();
    await joined();
    const event = { ...TABLE_EVENT, sceneId: VHARN.id, definition: poisoned };
    transport.serverEmits('condition:definitionUpdated', event);
    expect(updates).toEqual([]);
    expect(syncsSent()).toBe(2);
  });

  it("another table's events are not this one's, valid or not", async () => {
    follow();
    await joined();
    transport.serverEmits('character:changed', {
      ...characterChanged(4, lyraCharacter()),
      campaignId: QUELM.id,
    });
    transport.serverEmits('character:removed', { campaignId: QUELM.id, version: 'x' });
    expect(updates).toEqual([]);
    expect(syncsSent()).toBe(1);
  });

  it('a malformed event of this table asks the sync again instead of reaching the listener', async () => {
    follow();
    await joined();
    await transport.answerAck(
      { ok: true, version: 3, characters: [], conditionDefinitions: [] },
      SYNC,
    );
    transport.serverEmits('character:changed', {
      ...characterChanged(4, lyraCharacter()),
      characters: [],
    });
    expect(updates).toHaveLength(1);
    expect(syncsSent()).toBe(2);
  });

  it('resync asks the snapshot again', async () => {
    const followed = follow();
    await joined();
    followed.resync();
    expect(syncsSent()).toBe(2);
  });

  it('a reconnection syncs the characters again', async () => {
    follow();
    await joined();
    await transport.answerAck(
      { ok: true, version: 3, characters: [], conditionDefinitions: [] },
      SYNC,
    );
    transport.lifecycle({ kind: 'disconnected', willRetry: true });
    await joined();
    expect(syncsSent()).toBe(2);
  });

  it('after close nothing reaches the listener, not even a sync that was on its way', async () => {
    follow();
    await joined();
    handle.close();
    await transport.answerAck(
      { ok: true, version: 3, characters: [], conditionDefinitions: [] },
      SYNC,
    );
    transport.serverEmits('character:removed', characterRemoved(5));
    expect(updates).toEqual([]);
  });
});
