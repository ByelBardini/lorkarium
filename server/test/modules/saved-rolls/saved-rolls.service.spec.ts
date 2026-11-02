import { describe, expect, it } from 'vitest';
import { SavedRollsService } from '../../../src/modules/saved-rolls/saved-rolls.service';
import {
  BIA_ID,
  CAIO_ID,
  DUDA_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
} from '../../support/campaigns-factories';
import { MembershipReadsFake } from '../../support/campaigns-fakes';
import {
  ACERTO_ID,
  MAGIAS_ID,
  SavedRollFoldersDaoFake,
  SavedRollsDaoFake,
  SavedRollsTransactionRunnerFake,
  savedRollFolderPo,
  savedRollPo,
} from '../../support/saved-rolls-fakes';

const BIA = { campaignId: VHARN_ID, userId: BIA_ID };
const CAIO = { campaignId: VHARN_ID, userId: CAIO_ID };
const DUDA = { campaignId: VHARN_ID, userId: DUDA_ID };
const ATTACK = [{ label: null, expression: '1d20+5' }];

function setup(rows = [savedRollPo()]) {
  const journal: string[] = [];
  const members = new MembershipReadsFake([
    campaignMemberPo({ userId: BIA_ID, role: 'player' }),
    campaignMemberPo({ userId: CAIO_ID, role: 'player' }),
    campaignMemberPo({ userId: DUDA_ID, role: 'spectator' }),
  ]);
  const rolls = new SavedRollsDaoFake(journal, rows);
  const folders = new SavedRollFoldersDaoFake(journal, [savedRollFolderPo()]);
  const transaction = new SavedRollsTransactionRunnerFake(journal, { rolls, folders }).run;
  const service = new SavedRollsService({ members, rolls, folders, transaction, maxSaved: 50 });
  return { service, journal, members, rolls };
}

function rollsOfBia(count: number) {
  return Array.from({ length: count }, (_, index) =>
    savedRollPo({ id: `roll-of-bia-${index}`, name: `R${index}`, nameKey: `r${index}` }),
  );
}

describe('SavedRollsService.list', () => {
  it('Bia lists hers', async () => {
    const { service } = setup();

    expect(await service.list(BIA)).toEqual({
      savedRolls: [{ id: ACERTO_ID, name: 'Acerto', folderId: null, parts: ATTACK }],
    });
  });

  it('Caio does not see the rolls of Bia', async () => {
    const { service } = setup();

    expect(await service.list(CAIO)).toEqual({ savedRolls: [] });
  });
});

describe('SavedRollsService.create', () => {
  it('Bia saves "Bênção": lock → count → insert → commit, and gets the roll back', async () => {
    const { service, journal } = setup();

    const roll = await service.create(BIA, {
      name: 'Bênção',
      parts: [{ label: null, expression: '1d4' }],
    });

    expect(journal).toEqual(['lock', 'count', 'insert:Bênção', 'commit']);
    expect(roll).toEqual({
      id: 'roll-2',
      name: 'Bênção',
      folderId: null,
      parts: [{ label: null, expression: '1d4' }],
    });
  });

  it('"acérto" again is SAVED_ROLL_NAME_TAKEN citing the name, and nothing commits', async () => {
    const { service, journal } = setup();

    const saving = service.create(BIA, { name: 'acérto', parts: ATTACK });

    await expect(saving).rejects.toMatchObject({
      code: 'SAVED_ROLL_NAME_TAKEN',
      message: expect.stringContaining('"acérto"'),
    });
    expect(journal).toEqual(['lock', 'count']);
  });

  it('with 50 kept, the 51st is SAVED_ROLLS_LIMIT and nothing is inserted', async () => {
    const { service, journal } = setup(rollsOfBia(50));

    const saving = service.create(BIA, { name: 'Mais uma', parts: ATTACK });

    await expect(saving).rejects.toMatchObject({ code: 'SAVED_ROLLS_LIMIT' });
    expect(journal).toEqual(['lock', 'count']);
  });

  it('"2d" is INVALID_DICE_EXPRESSION citing piece 1, before the transaction', async () => {
    const { service, journal } = setup();

    const saving = service.create(BIA, {
      name: 'Quebrada',
      parts: [{ label: null, expression: '2d' }],
    });

    await expect(saving).rejects.toMatchObject({ code: 'INVALID_DICE_EXPRESSION', part: 1 });
    expect(journal).toEqual([]);
  });

  it('Duda, a spectator, is FORBIDDEN before any read of the rolls', async () => {
    const { service, journal } = setup();

    await expect(service.create(DUDA, { name: 'X', parts: ATTACK })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(journal).toEqual([]);
  });

  it('someone outside Quelm is CAMPAIGN_NOT_FOUND', async () => {
    const { service, journal } = setup();

    const saving = service.create(
      { campaignId: QUELM_ID, userId: BIA_ID },
      { name: 'X', parts: ATTACK },
    );

    await expect(saving).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
    expect(journal).toEqual([]);
  });

  it('Bia left the table between the check and the lock: CAMPAIGN_NOT_FOUND, nothing inserted', async () => {
    const { service, journal, rolls } = setup();
    rolls.owners.clear();

    await expect(service.create(BIA, { name: 'X', parts: ATTACK })).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
    expect(journal).toEqual(['lock']);
  });
});

describe('SavedRollsService.update', () => {
  it('Bia renames "Acerto" and changes its pieces', async () => {
    const { service, journal } = setup();
    const parts = [{ label: 'Espada', expression: '1d20+7' }];

    const roll = await service.update(BIA, ACERTO_ID, { name: 'Acerto com espada', parts });

    expect(roll).toEqual({ id: ACERTO_ID, name: 'Acerto com espada', folderId: null, parts });
    expect(journal).toEqual([`update:${ACERTO_ID}`]);
  });

  it('Caio on the roll of Bia is SAVED_ROLL_NOT_FOUND', async () => {
    const { service, journal } = setup();

    await expect(service.update(CAIO, ACERTO_ID, { name: 'Meu' })).rejects.toMatchObject({
      code: 'SAVED_ROLL_NOT_FOUND',
    });
    expect(journal).toEqual([]);
  });

  it('renaming onto a name Bia already has is SAVED_ROLL_NAME_TAKEN', async () => {
    const bless = savedRollPo({ id: 'bless', name: 'Bênção', nameKey: 'bencao' });
    const { service } = setup([savedRollPo(), bless]);

    await expect(service.update(BIA, 'bless', { name: 'ACERTO' })).rejects.toMatchObject({
      code: 'SAVED_ROLL_NAME_TAKEN',
    });
  });

  it('a piece "1d" is INVALID_DICE_EXPRESSION and nothing is written', async () => {
    const { service, journal } = setup();
    const parts = [
      { label: null, expression: '1d4' },
      { label: null, expression: '1d' },
    ];

    await expect(service.update(BIA, ACERTO_ID, { parts })).rejects.toMatchObject({
      code: 'INVALID_DICE_EXPRESSION',
      part: 2,
    });
    expect(journal).toEqual([]);
  });

  it('Duda, a spectator, is FORBIDDEN', async () => {
    const { service, members } = setup();

    await expect(service.update(DUDA, ACERTO_ID, { name: 'X' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(members.reads).toEqual([`${VHARN_ID}:${DUDA_ID}`]);
  });
});

describe('SavedRollsService.remove', () => {
  it('Bia deletes "Acerto"', async () => {
    const { service, rolls } = setup();

    await service.remove(BIA, ACERTO_ID);

    expect(rolls.rows).toEqual([]);
  });

  it('Caio deleting the roll of Bia is SAVED_ROLL_NOT_FOUND and it stays', async () => {
    const { service, rolls } = setup();

    await expect(service.remove(CAIO, ACERTO_ID)).rejects.toMatchObject({
      code: 'SAVED_ROLL_NOT_FOUND',
    });
    expect(rolls.rows).toHaveLength(1);
  });
});

describe('SavedRollsService and folders', () => {
  it('saves into her own folder', async () => {
    const { service } = setup();

    const roll = await service.create(BIA, { name: 'Luz', folderId: MAGIAS_ID, parts: ATTACK });

    expect(roll.folderId).toBe(MAGIAS_ID);
  });

  it('moves a roll into her folder and back out', async () => {
    const { service } = setup();

    const moved = await service.update(BIA, ACERTO_ID, { folderId: MAGIAS_ID });
    const out = await service.update(BIA, ACERTO_ID, { folderId: null });

    expect([moved.folderId, out.folderId]).toEqual([MAGIAS_ID, null]);
  });

  it('moving to a folder of someone else finds nothing and nothing is written', async () => {
    const { service, rolls, journal } = setup([savedRollPo({ userId: CAIO_ID })]);

    await expect(service.update(CAIO, ACERTO_ID, { folderId: MAGIAS_ID })).rejects.toMatchObject({
      code: 'SAVED_ROLL_FOLDER_NOT_FOUND',
    });
    expect(journal).toEqual(['folder:find']);
    expect(rolls.rows[0]?.folderId).toBeNull();
  });

  it('creating into a folder of someone else stops before the insert', async () => {
    const { service, rolls, journal } = setup();
    rolls.owners.add(`${VHARN_ID}:${CAIO_ID}`);

    const create = service.create(CAIO, { name: 'Luz', folderId: MAGIAS_ID, parts: ATTACK });

    await expect(create).rejects.toMatchObject({ code: 'SAVED_ROLL_FOLDER_NOT_FOUND' });
    expect(journal).not.toContain('insert:Luz');
  });
});
