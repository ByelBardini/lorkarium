import {
  characterChangedEventDto,
  characterRemovedEventDto,
  type CharacterDto,
} from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { CharactersDao } from '../../src/modules/characters/characters.dao';
import { envelope, eventPayload, send, silence } from '../support/live-table';
import { recordEventsOf, type EventRecorder } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import {
  CHARACTER_MANA,
  CHARACTER_PV,
  characterOfUser,
  characterUpdate,
  charactersSynced,
  giveBars,
} from '../support/table-characters';
import { useTokenTable } from '../support/token-table';

const STRANGER_ID = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';

describe('characters over Socket.IO', () => {
  const live = useTokenTable();
  let biaCharacterId: string;
  let pvId: string;

  // Promoting Bia and Caio (the harness) gave each a character; Bia's gets a PV and a Mana.
  beforeEach(async () => {
    biaCharacterId = (await characterOfUser(live, live.vharn, live.bia)).character.id;
    await giveBars(live, biaCharacterId, [CHARACTER_PV, CHARACTER_MANA]);
    pvId = (await characterOfUser(live, live.vharn, live.bia)).bars[0]?.id ?? '';
  });

  async function changedOf(recorder: EventRecorder): Promise<CharacterDto | undefined> {
    const event = characterChangedEventDto.parse(await eventPayload(recorder, 'character:changed'));
    return event.characters.find(({ id }) => id === biaCharacterId);
  }

  it('Bia changing her armor class acks the version, Ana hears it whole, Caio without the PV, and the sync agrees', async () => {
    const anaEvents = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const caio = await live.atTable(live.caio, live.vharn);
    const caioEvents = recordEventsOf(caio);
    const bia = await live.atTable(live.bia, live.vharn);
    const before = (await charactersSynced(bia, live.vharn)).version;

    const ack = await send(
      bia,
      'character:update',
      characterUpdate(live.vharn, biaCharacterId, { armorClass: 15 }),
    );

    expect(ack).toEqual({ ok: true, version: before + 1 });
    const whole = await changedOf(anaEvents);
    expect(whole).toMatchObject({ armorClass: 15, canControl: true });
    expect(whole?.bars.map(({ label }) => label)).toEqual(['PV', 'Mana']);
    const redacted = await changedOf(caioEvents);
    expect(redacted).toMatchObject({ armorClass: 15, canControl: false });
    expect(redacted?.bars.map(({ label, position }) => [label, position])).toEqual([['Mana', 1]]);
    expect((await charactersSynced(caio, live.vharn)).version).toBe(before + 1);
  });

  it('Ana, the master, writing the first note of the character of Bia reaches Bia', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));

    const update = characterUpdate(live.vharn, biaCharacterId, { noteOne: 'Ferida' });
    expect(await send(master, 'character:update', update)).toMatchObject({ ok: true });

    expect(await changedOf(biaEvents)).toMatchObject({ noteOne: 'Ferida', canControl: true });
  });

  it('Bia taking 7 from her PV: Ana hears 18 and Caio hears the character without the PV', async () => {
    const anaEvents = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const bia = await live.atTable(live.bia, live.vharn);
    const adjust = { ...envelope(live.vharn.id), characterId: biaCharacterId, barId: pvId };

    const ack = await send(bia, 'character:adjustBar', {
      ...adjust,
      change: { op: 'add', amount: -7 },
    });

    expect(ack).toMatchObject({ ok: true });
    expect((await changedOf(anaEvents))?.bars[0]).toMatchObject({ label: 'PV', current: 18 });
    expect((await changedOf(caioEvents))?.bars.map(({ label }) => label)).toEqual(['Mana']);
  });

  it('after a restart, the character:sync keeps the armor class (critério 13)', async () => {
    const bia = await live.atTable(live.bia, live.vharn);
    await send(
      bia,
      'character:update',
      characterUpdate(live.vharn, biaCharacterId, { armorClass: 13 }),
    );

    await live.restart();

    const synced = await charactersSynced(await live.atTable(live.ana, live.vharn), live.vharn);
    expect(synced.characters.find(({ id }) => id === biaCharacterId)?.armorClass).toBe(13);
  });

  it('Caio, a player, changing the character of Bia gets FORBIDDEN and nobody hears of it', async () => {
    const anaEvents = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const caio = await live.atTable(live.caio, live.vharn);

    const ack = await send(
      caio,
      'character:update',
      characterUpdate(live.vharn, biaCharacterId, { armorClass: 3 }),
    );

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(anaEvents.events.map(({ name }) => name)).not.toContain('character:changed');
  });

  it('an unknown characterId gets CHARACTER_NOT_FOUND with its public message', async () => {
    const master = await live.atTable(live.ana, live.vharn);

    const ack = await send(
      master,
      'character:update',
      characterUpdate(live.vharn, STRANGER_ID, { armorClass: 3 }),
    );

    expect(ack).toEqual({
      ok: false,
      error: { code: 'CHARACTER_NOT_FOUND', message: 'Character not found' },
    });
  });

  it('a character:update carrying a forged userId gets INVALID_BODY', async () => {
    const caio = await live.atTable(live.caio, live.vharn);
    const forged = {
      ...characterUpdate(live.vharn, biaCharacterId, { armorClass: 3 }),
      userId: live.bia.id,
    };

    const ack = await send(caio, 'character:update', forged);

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });

  it('Bia sending the campaignId of Quelm is CAMPAIGN_NOT_FOUND and the Quelm room hears nothing', async () => {
    const quelmEvents = recordEventsOf(await live.atTable(live.caio, live.quelm));
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(
      bia,
      'character:update',
      characterUpdate(live.quelm, biaCharacterId, { armorClass: 3 }),
    );

    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    });
    await silence();
    expect(quelmEvents.events.map(({ name }) => name)).not.toContain('character:changed');
  });

  describe('Duda, a spectator', () => {
    let duda: SignedInUser;
    let miraId: string;

    beforeEach(async () => {
      duda = await live.signUp('Duda');
      await live.joinAsSpectator(duda, live.vharn);
      const dao = new CharactersDao(live.connection.db);
      const mira = { campaignId: live.vharn.id, userId: duda.id, name: 'Mira', initials: 'MI' };
      const row = { character: { ...mira, side: 'ally' as const }, bars: [] };
      miraId = (await dao.insert({ ...row, controllerIds: [duda.id] })).character.id;
    });

    it('her character:sync comes redacted and without the stored characters of spectators', async () => {
      const synced = await charactersSynced(await live.atTable(duda, live.vharn), live.vharn);

      const ids = synced.characters.map(({ id }) => id);
      expect(ids).toContain(biaCharacterId);
      expect(ids).not.toContain(miraId);
      expect(synced.characters.every(({ canControl }) => !canControl)).toBe(true);
      const bia = synced.characters.find(({ id }) => id === biaCharacterId);
      expect(bia?.bars.map(({ label }) => label)).toEqual(['Mana']);
    });

    it('Ana changing the stored Mira: Ana hears it whole and Caio and Duda hear it removed in that version', async () => {
      const ana = await live.atTable(live.ana, live.vharn);
      const anaEvents = recordEventsOf(ana);
      const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));
      const dudaEvents = recordEventsOf(await live.atTable(duda, live.vharn));

      const ack = await send(
        ana,
        'character:update',
        characterUpdate(live.vharn, miraId, { armorClass: 12 }),
      );

      expect(ack).toMatchObject({ ok: true });
      const whole = characterChangedEventDto.parse(
        await eventPayload(anaEvents, 'character:changed'),
      );
      expect(whole.characters.map(({ id }) => id)).toEqual([miraId]);
      for (const recorder of [caioEvents, dudaEvents]) {
        const removed = characterRemovedEventDto.parse(
          await eventPayload(recorder, 'character:removed'),
        );
        expect(removed).toMatchObject({ characterId: miraId, version: whole.version });
      }
      expect(caioEvents.events.map(({ name }) => name)).not.toContain('character:changed');
    });
  });
});
