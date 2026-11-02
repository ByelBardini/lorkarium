import { beforeEach, describe, expect, it } from 'vitest';
import type { MemberRoleChange } from '../../../src/modules/campaigns/member-role-changed.port';
import {
  CharacterSeatService,
  type CharacterSeatDaos,
  type CharacterSeatTransactionRunner,
} from '../../../src/modules/characters/character-seat.service';
import { ClockFake, UsersDaoFake } from '../../support/auth-fakes';
import { ANA_ID, userPo } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, DUDA_ID, QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';
import { LYRA_CHARACTER_ID, characterRow } from '../../support/characters-factories';
import { CharacterPublisherFake, CharactersDaoFake } from '../../support/characters-fakes';

const NOW = new Date('2026-10-31T22:00:00Z');

function roleChange(
  userId: string,
  from: MemberRoleChange['from'],
  role: MemberRoleChange['role'],
  campaignId = VHARN_ID,
): MemberRoleChange {
  return { campaignId, userId, from, role };
}

describe('CharacterSeatService', () => {
  let journal: string[];
  let characters: CharactersDaoFake;
  let publisher: CharacterPublisherFake;
  let daos: CharacterSeatDaos;
  let service: CharacterSeatService;

  beforeEach(() => {
    journal = [];
    characters = new CharactersDaoFake(journal, [], { [VHARN_ID]: 4, [QUELM_ID]: 9 });
    const users = new UsersDaoFake([
      userPo({ id: DUDA_ID, name: 'Duda da Silva' }),
      userPo({ id: ANA_ID, name: 'Ana' }),
    ]);
    daos = { characters, users };
    publisher = new CharacterPublisherFake(journal);
    const transaction: CharacterSeatTransactionRunner = async (work) => {
      const result = await work(daos);
      journal.push('commit');
      return result;
    };
    service = new CharacterSeatService({ transaction, publisher, clock: new ClockFake(NOW) });
  });

  describe('in the transaction of a new role', () => {
    it('Duda, spectator → player without a character, gets one with her nickname and tells it after the commit', async () => {
      characters.roles[DUDA_ID] = 'player';

      const notice = await service
        .seatIn(daos)
        .roleSaved(roleChange(DUDA_ID, 'spectator', 'player'));

      expect(journal).toEqual(['lock characters', 'insert', 'bump characters']);
      expect(publisher.changes).toEqual([]);
      notice();
      const [created] = characters.rows;
      expect(created?.character).toMatchObject({
        campaignId: VHARN_ID,
        userId: DUDA_ID,
        name: 'Duda da Silva',
        initials: 'DS',
        side: 'ally',
        width: 1,
        height: 1,
      });
      expect(created?.controllerIds).toEqual([DUDA_ID]);
      expect(publisher.changes[0]).toMatchObject({
        campaignId: VHARN_ID,
        version: 5,
        at: NOW.toISOString(),
      });
      expect(publisher.changes[0]?.characters[0]).toMatchObject({
        seenByTable: true,
        privilegedUserIds: [DUDA_ID],
        privileged: { name: 'Duda da Silva', canControl: true },
      });
    });

    it('Ana, master → player without a character, gets one too', async () => {
      await service.seatIn(daos).roleSaved(roleChange(ANA_ID, 'master', 'player'));

      expect(characters.rows.map(({ character }) => character.name)).toEqual(['Ana']);
    });

    it('Bia, player → spectator, writes nothing on Lyra; the version moves and the table hears it hidden', async () => {
      characters.rows.push(characterRow({ holderRole: 'spectator' }));

      const notice = await service
        .seatIn(daos)
        .roleSaved(roleChange(BIA_ID, 'player', 'spectator'));
      notice();

      expect(journal).toEqual(['lock characters', 'bump characters', 'publish']);
      expect(publisher.changes[0]?.characters[0]).toMatchObject({
        characterId: LYRA_CHARACTER_ID,
        seenByTable: false,
      });
    });

    it('Bia, spectator → player again with Lyra stored, gets Lyra back and no other', async () => {
      characters.rows.push(characterRow({ holderRole: 'player' }));

      const notice = await service
        .seatIn(daos)
        .roleSaved(roleChange(BIA_ID, 'spectator', 'player'));
      notice();

      expect(characters.rows).toHaveLength(1);
      expect(journal).toEqual(['lock characters', 'bump characters', 'publish']);
      expect(publisher.changes[0]?.characters[0]).toMatchObject({
        characterId: LYRA_CHARACTER_ID,
        seenByTable: true,
      });
    });

    it.each([
      ['Bia, player → master, keeps Lyra', BIA_ID, 'player', 'master'],
      ['Duda, spectator → master, gets none', DUDA_ID, 'spectator', 'master'],
    ] as const)('%s: no write, no bump, nothing told', async (_case, userId, from, role) => {
      if (userId === BIA_ID) characters.rows.push(characterRow({ holderRole: 'master' }));

      const notice = await service.seatIn(daos).roleSaved(roleChange(userId, from, role));
      notice();

      expect(journal).toEqual(['lock characters']);
      expect(characters.versions[VHARN_ID]).toBe(4);
      expect(publisher.changes).toEqual([]);
    });

    it('Duda promoted at Quelm creates nothing at Vharn and moves only the version of Quelm', async () => {
      await service.seatIn(daos).roleSaved(roleChange(DUDA_ID, 'spectator', 'player', QUELM_ID));

      expect(characters.rows.map(({ character }) => character.campaignId)).toEqual([QUELM_ID]);
      expect(characters.versions).toEqual({ [VHARN_ID]: 4, [QUELM_ID]: 10 });
    });
  });

  describe('memberRemoved', () => {
    it('Bia out of Vharn: Lyra stays nobody’s, without Bia in the control, told to the masters only', async () => {
      characters.rows.push(characterRow({ controllerIds: [BIA_ID, CAIO_ID] }));

      await service.memberRemoved({ campaignId: VHARN_ID, userId: BIA_ID });

      expect(journal).toEqual([
        'lock characters',
        'set user',
        'controllers',
        'bump characters',
        'commit',
        'publish',
      ]);
      expect(characters.rows[0]).toMatchObject({
        character: { userId: null },
        controllerIds: [CAIO_ID],
        holderRole: null,
      });
      expect(publisher.changes[0]?.characters[0]).toMatchObject({
        seenByTable: false,
        privileged: { userId: null },
      });
    });

    it('someone without a character out of Vharn writes and tells nothing', async () => {
      await service.memberRemoved({ campaignId: VHARN_ID, userId: DUDA_ID });

      expect(journal).toEqual(['lock characters', 'commit']);
      expect(publisher.changes).toEqual([]);
    });
  });
});
