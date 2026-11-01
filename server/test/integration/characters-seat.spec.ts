import { characterChangedEventDto, characterRemovedEventDto } from '@lorkarium/contracts';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { CampaignMembersDao } from '../../src/modules/campaigns/campaign-members.dao';
import { campaignMembers } from '../../src/modules/campaigns/campaign-members.po';
import { createCharactersModule } from '../../src/modules/characters/characters.plugin';
import { ClockFake } from '../support/auth-fakes';
import { CharacterPublisherFake } from '../support/characters-fakes';
import { eventPayload, send } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import { characterOfUser, characterUpdate, charactersSynced } from '../support/table-characters';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

describe('the character follows the role of its player', () => {
  const live = useTokenTable();

  async function setRole(table: Table, user: SignedInUser, role: string): Promise<void> {
    const url = `/api/campaigns/${table.id}/members/${user.id}`;
    const response = await live.http(table.master, { method: 'PATCH', url, payload: { role } });
    expect(response.statusCode).toBe(200);
  }

  it('a new table gives its master no character, and Bia and Caio got one each on promotion', async () => {
    const quelm = await charactersSynced(await live.atTable(live.caio, live.quelm), live.quelm);
    const vharn = await charactersSynced(await live.atTable(live.ana, live.vharn), live.vharn);

    expect(quelm.characters).toEqual([]);
    expect(vharn.characters.map(({ userId, name, initials }) => [userId, name, initials])).toEqual([
      [live.bia.id, 'Bia', 'BI'],
      [live.caio.id, 'Caio', 'CA'],
    ]);
    expect(vharn.version).toBe(2);
  });

  it('Duda entering by the code has no character; Ana promoting her makes one that Ana and Bia hear', async () => {
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.vharn);
    const ana = await live.atTable(live.ana, live.vharn);
    expect((await charactersSynced(ana, live.vharn)).characters).toHaveLength(2);
    const anaEvents = recordEventsOf(ana);
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));

    await setRole(live.vharn, duda, 'player');

    for (const recorder of [anaEvents, biaEvents]) {
      const event = characterChangedEventDto.parse(
        await eventPayload(recorder, 'character:changed'),
      );
      expect(event.version).toBe(3);
      expect(event.characters).toEqual([
        expect.objectContaining({
          userId: duda.id,
          name: 'Duda',
          side: 'ally',
          controllerIds: [duda.id],
        }),
      ]);
    }
  });

  it('demoting Bia hides her character from Caio and promoting her again brings the same one, CA kept', async () => {
    const lyra = await characterOfUser(live, live.vharn, live.bia);
    const bia = await live.atTable(live.bia, live.vharn);
    const update = characterUpdate(live.vharn, lyra.character.id, { armorClass: 15 });
    expect(await send(bia, 'character:update', update)).toMatchObject({ ok: true });
    const caio = await live.atTable(live.caio, live.vharn);
    const caioEvents = recordEventsOf(caio);

    await setRole(live.vharn, live.bia, 'spectator');

    const removed = characterRemovedEventDto.parse(
      await eventPayload(caioEvents, 'character:removed'),
    );
    expect(removed.characterId).toBe(lyra.character.id);
    expect(
      (await charactersSynced(caio, live.vharn)).characters.map(({ userId }) => userId),
    ).toEqual([live.caio.id]);
    const master = await charactersSynced(await live.atTable(live.ana, live.vharn), live.vharn);
    expect(master.characters.map(({ id }) => id)).toContain(lyra.character.id);

    await setRole(live.vharn, live.bia, 'player');

    const back = (await charactersSynced(caio, live.vharn)).characters;
    expect(back.find(({ userId }) => userId === live.bia.id)).toMatchObject({
      id: lyra.character.id,
      armorClass: 15,
    });
  });

  it('Bia out of Vharn: Ana still sees her character, nobody’s, and Caio no longer does', async () => {
    const lyra = await characterOfUser(live, live.vharn, live.bia);
    const { db } = live.connection;
    const ofBia = and(
      eq(campaignMembers.campaignId, live.vharn.id),
      eq(campaignMembers.userId, live.bia.id),
    );
    await db.delete(campaignMembers).where(ofBia);
    const members = new CampaignMembersDao(db);
    const options = {
      db,
      members,
      publisher: new CharacterPublisherFake(),
      clock: new ClockFake(new Date()),
    };

    await createCharactersModule(options).seats.memberRemoved({
      campaignId: live.vharn.id,
      userId: live.bia.id,
    });

    const master = await charactersSynced(await live.atTable(live.ana, live.vharn), live.vharn);
    expect(master.characters.find(({ id }) => id === lyra.character.id)).toMatchObject({
      userId: null,
      controllerIds: [],
    });
    const player = await charactersSynced(await live.atTable(live.caio, live.vharn), live.vharn);
    expect(player.characters.map(({ id }) => id)).not.toContain(lyra.character.id);
  });

  it('Caio promoting Duda at Quelm creates hers at Quelm and nothing at Vharn', async () => {
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.quelm);

    await setRole(live.quelm, duda, 'player');

    const quelm = await charactersSynced(await live.atTable(live.caio, live.quelm), live.quelm);
    expect(quelm.characters.map(({ userId }) => userId)).toEqual([duda.id]);
    const vharn = await charactersSynced(await live.atTable(live.ana, live.vharn), live.vharn);
    expect([vharn.version, vharn.characters.length]).toEqual([2, 2]);
  });
});
