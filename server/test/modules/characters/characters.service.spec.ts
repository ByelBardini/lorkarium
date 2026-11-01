import { beforeEach, describe, expect, it } from 'vitest';
import { CharactersService } from '../../../src/modules/characters/characters.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import {
  BIA_ID,
  CAIO_ID,
  DUDA_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
} from '../../support/campaigns-factories';
import {
  LYRA_CHARACTER_ID,
  LYRA_CHARACTER_MANA_ID,
  LYRA_CHARACTER_PV_ID,
  characterPo,
  characterRow,
} from '../../support/characters-factories';
import {
  CharacterPublisherFake,
  CharacterSnapshotRunnerFake,
  CharacterTransactionRunnerFake,
  CharactersDaoFake,
} from '../../support/characters-fakes';

const NOW = new Date('2026-10-31T21:00:00Z');
const STRANGER_ID = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';
const MIRA_ID = '3f2e1d0c-9b8a-4f7e-8d6c-5b4a3f2e1d0c';
const SOMBRA_ID = '4a3f2e1d-0c9b-4a8f-9e7d-6c5b4a3f2e1d';

describe('CharactersService', () => {
  let journal: string[];
  let characters: CharactersDaoFake;
  let publisher: CharacterPublisherFake;
  let service: CharactersService;

  beforeEach(() => {
    journal = [];
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: DUDA_ID, role: 'spectator' }),
      campaignMemberPo({ campaignId: QUELM_ID, userId: CAIO_ID, role: 'master' }),
    ]);
    const mira = characterPo({ id: MIRA_ID, userId: DUDA_ID, name: 'Mira', initials: 'MI' });
    const sombra = characterPo({ id: SOMBRA_ID, campaignId: QUELM_ID, userId: CAIO_ID });
    characters = new CharactersDaoFake(
      journal,
      [
        characterRow(),
        characterRow({
          character: mira,
          bars: [],
          controllerIds: [DUDA_ID],
          holderRole: 'spectator',
        }),
        characterRow({
          character: sombra,
          bars: [],
          controllerIds: [CAIO_ID],
          holderRole: 'master',
        }),
      ],
      { [VHARN_ID]: 4, [QUELM_ID]: 9 },
    );
    publisher = new CharacterPublisherFake(journal);
    service = new CharactersService({
      members,
      transaction: new CharacterTransactionRunnerFake(characters).run,
      snapshot: new CharacterSnapshotRunnerFake(characters).run,
      publisher,
      clock: new ClockFake(NOW),
      barLimit: 99_999,
    });
  });

  describe('update', () => {
    it('Bia changing the armor class of Lyra locks, writes, bumps, commits and then publishes it', async () => {
      const update = { characterId: LYRA_CHARACTER_ID, changes: { armorClass: 15 } };

      const version = await service.update(BIA_ID, VHARN_ID, update);

      expect(version).toBe(5);
      expect(journal).toEqual([
        'lock characters',
        'update',
        'bump characters',
        'commit',
        'publish',
      ]);
      const [change] = publisher.changes;
      expect(change).toMatchObject({ campaignId: VHARN_ID, version: 5, at: NOW.toISOString() });
      expect(change?.characters).toEqual([
        expect.objectContaining({
          characterId: LYRA_CHARACTER_ID,
          seenByTable: true,
          privilegedUserIds: [BIA_ID],
          privileged: expect.objectContaining({ armorClass: 15, canControl: true }),
          others: expect.objectContaining({ armorClass: 15, canControl: false }),
        }),
      ]);
      expect(change?.characters[0]?.others.bars.map(({ id }) => id)).toEqual([
        LYRA_CHARACTER_MANA_ID,
      ]);
    });

    it('Ana, the master, writing the first note of Lyra saves it', async () => {
      const update = { characterId: LYRA_CHARACTER_ID, changes: { noteOne: 'Ferida' } };

      await service.update(ANA_ID, VHARN_ID, update);

      expect(characters.rows[0]?.character.noteOne).toBe('Ferida');
    });

    it('Caio on Lyra of Bia is FORBIDDEN after the lock: nothing written, bumped nor published', async () => {
      const update = { characterId: LYRA_CHARACTER_ID, changes: { armorClass: 3 } };

      await expect(service.update(CAIO_ID, VHARN_ID, update)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(journal).toEqual(['lock characters']);
      expect(characters.versions[VHARN_ID]).toBe(4);
    });

    it('Caio on Mira, the stored character of the spectator Duda, gets CHARACTER_NOT_FOUND', async () => {
      const update = { characterId: MIRA_ID, changes: { armorClass: 3 } };

      await expect(service.update(CAIO_ID, VHARN_ID, update)).rejects.toMatchObject({
        code: 'CHARACTER_NOT_FOUND',
      });
      expect(publisher.changes).toEqual([]);
    });

    it('Ana asking at Vharn for Sombra of Quelm gets CHARACTER_NOT_FOUND and Quelm keeps its version', async () => {
      const update = { characterId: SOMBRA_ID, changes: { armorClass: 3 } };

      await expect(service.update(ANA_ID, VHARN_ID, update)).rejects.toMatchObject({
        code: 'CHARACTER_NOT_FOUND',
      });
      expect(characters.versions[QUELM_ID]).toBe(9);
    });

    it.each([
      ['Duda, a spectator', 'FORBIDDEN', DUDA_ID],
      ['a stranger to Vharn', 'CAMPAIGN_NOT_FOUND', STRANGER_ID],
    ])('%s is refused with %s before any lock', async (_who, code, userId) => {
      const update = { characterId: LYRA_CHARACTER_ID, changes: { armorClass: 3 } };

      await expect(service.update(userId, VHARN_ID, update)).rejects.toMatchObject({ code });
      expect(journal).toEqual([]);
    });
  });

  describe('adjustBar', () => {
    it('Bia taking 7 from the PV of Lyra writes 18, bumps once and publishes the bar', async () => {
      const adjust = {
        characterId: LYRA_CHARACTER_ID,
        barId: LYRA_CHARACTER_PV_ID,
        change: { op: 'add', amount: -7 },
      } as const;

      const version = await service.adjustBar(BIA_ID, VHARN_ID, adjust);

      expect(version).toBe(5);
      expect(journal).toEqual([
        'lock characters',
        'set bar',
        'bump characters',
        'commit',
        'publish',
      ]);
      const bars = publisher.changes[0]?.characters[0]?.privileged.bars;
      expect(bars?.[0]).toMatchObject({ id: LYRA_CHARACTER_PV_ID, current: 18, max: 30 });
    });

    it('a bar that is not of Lyra is BAR_NOT_FOUND and nothing is written', async () => {
      const adjust = {
        characterId: LYRA_CHARACTER_ID,
        barId: STRANGER_ID,
        change: { op: 'add', amount: -7 },
      } as const;

      await expect(service.adjustBar(BIA_ID, VHARN_ID, adjust)).rejects.toMatchObject({
        code: 'BAR_NOT_FOUND',
      });
      expect(journal).toEqual(['lock characters']);
    });
  });

  describe('sync', () => {
    it('Caio gets Lyra redacted, without Mira of the spectator, in the version 4', async () => {
      const synced = await service.sync(CAIO_ID, VHARN_ID);

      expect(synced.version).toBe(4);
      expect(synced.characters.map(({ id, canControl }) => [id, canControl])).toEqual([
        [LYRA_CHARACTER_ID, false],
      ]);
      expect(synced.characters[0]?.bars.map(({ id }) => id)).toEqual([LYRA_CHARACTER_MANA_ID]);
    });

    it('Duda, a spectator, reads Lyra redacted and not her own stored Mira', async () => {
      const synced = await service.sync(DUDA_ID, VHARN_ID);

      expect(synced.characters.map(({ id, canControl }) => [id, canControl])).toEqual([
        [LYRA_CHARACTER_ID, false],
      ]);
    });

    it('Ana, the master, gets Lyra and the stored Mira whole, and nothing of Quelm', async () => {
      const synced = await service.sync(ANA_ID, VHARN_ID);

      expect(synced.characters.map(({ id, canControl }) => [id, canControl])).toEqual([
        [LYRA_CHARACTER_ID, true],
        [MIRA_ID, true],
      ]);
    });

    it('a stranger to Vharn gets CAMPAIGN_NOT_FOUND', async () => {
      await expect(service.sync(STRANGER_ID, VHARN_ID)).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_FOUND',
      });
    });
  });
});
