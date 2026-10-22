import { memberCardChangedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import { useTokenTable } from '../support/token-table';

const STRANGER_ID = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';

describe('member cards over Socket.IO', () => {
  const live = useTokenTable();

  function updateCard(memberId: string, changes: object, campaignId = live.vharn.id): object {
    return { ...envelope(campaignId), memberId, changes };
  }

  it('Bia changing her armor class acks the new version, Ana and Caio hear the whole card and the sync carries it', async () => {
    const anaEvents = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const caio = await live.atTable(live.caio, live.vharn);
    const caioEvents = recordEventsOf(caio);
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'member:updateCard', updateCard(live.bia.id, { armorClass: 15 }));

    expect(ack).toEqual({ ok: true, version: 1 });
    const card = {
      userId: live.bia.id,
      characterName: null,
      armorClass: 15,
      difficultyClass: null,
      noteOne: null,
      noteTwo: null,
    };
    for (const recorder of [anaEvents, caioEvents]) {
      const event = memberCardChangedDto.parse(await eventPayload(recorder, 'member:cardChanged'));
      expect(event).toMatchObject({ campaignId: live.vharn.id, version: 1, card });
    }
    expect((await synced(caio, live.vharn)).memberCards).toEqual([card]);
  });

  it('Ana, the master, writing the first note of Bia reaches Bia', async () => {
    const master = await live.atTable(live.ana, live.vharn);
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));

    const ack = await send(
      master,
      'member:updateCard',
      updateCard(live.bia.id, { noteOne: 'Ferida' }),
    );

    expect(ack).toMatchObject({ ok: true });
    const event = memberCardChangedDto.parse(await eventPayload(biaEvents, 'member:cardChanged'));
    expect(event.card).toMatchObject({ userId: live.bia.id, noteOne: 'Ferida' });
  });

  it('a character name of only spaces clears the nickname and the event carries null', async () => {
    const bia = await live.atTable(live.bia, live.vharn);
    await send(bia, 'member:updateCard', updateCard(live.bia.id, { characterName: 'Lyra Vandel' }));
    const biaEvents = recordEventsOf(bia);

    await send(bia, 'member:updateCard', updateCard(live.bia.id, { characterName: '   ' }));

    const event = memberCardChangedDto.parse(await eventPayload(biaEvents, 'member:cardChanged'));
    expect(event.card.characterName).toBeNull();
  });

  it('after a restart, the board:sync keeps the card (critério 13)', async () => {
    const bia = await live.atTable(live.bia, live.vharn);
    await send(bia, 'member:updateCard', updateCard(live.bia.id, { difficultyClass: 13 }));

    await live.restart();

    const state = await synced(await live.atTable(live.ana, live.vharn), live.vharn);
    expect(state.memberCards).toEqual([expect.objectContaining({ difficultyClass: 13 })]);
  });

  it('Caio, a player, changing the card of Bia gets FORBIDDEN and nobody hears of it', async () => {
    const anaEvents = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const caio = await live.atTable(live.caio, live.vharn);

    const ack = await send(caio, 'member:updateCard', updateCard(live.bia.id, { armorClass: 3 }));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(anaEvents.events.map(({ name }) => name)).not.toContain('member:cardChanged');
  });

  it('a memberId of someone outside Vharn gets MEMBER_NOT_FOUND with its public message', async () => {
    const master = await live.atTable(live.ana, live.vharn);

    const ack = await send(master, 'member:updateCard', updateCard(STRANGER_ID, { armorClass: 3 }));

    expect(ack).toEqual({
      ok: false,
      error: { code: 'MEMBER_NOT_FOUND', message: 'Member not found' },
    });
  });

  it('a member:updateCard carrying a forged userId gets INVALID_BODY', async () => {
    const caio = await live.atTable(live.caio, live.vharn);
    const forged = { ...updateCard(live.bia.id, { armorClass: 3 }), userId: live.bia.id };

    const ack = await send(caio, 'member:updateCard', forged);

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });

  it('Bia sending the campaignId of Quelm is CAMPAIGN_NOT_FOUND and the Quelm room hears nothing', async () => {
    const quelmEvents = recordEventsOf(await live.atTable(live.caio, live.quelm));
    const bia = await live.atTable(live.bia, live.vharn);

    const command = updateCard(live.bia.id, { armorClass: 3 }, live.quelm.id);
    const ack = await send(bia, 'member:updateCard', command);

    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    });
    await silence();
    expect(quelmEvents.events.map(({ name }) => name)).not.toContain('member:cardChanged');
  });
});
