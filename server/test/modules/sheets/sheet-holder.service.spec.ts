import type { SheetHolderDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import type { SheetHolderPlacePo } from '../../../src/modules/sheets/sheets.dao';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, DUDA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { LYRA_CHARACTER_ID } from '../../support/characters-factories';
import {
  KAEL_CHARACTER_ID,
  QUELM_TOKEN_ID,
  SheetsHarness,
  lyraPlace,
  sheetPo,
} from '../../support/sheets-fakes';
import { BRAM_ID, LYRA_ID } from '../../support/tokens-factories';

function resolve(
  harness: SheetsHarness,
  holder: SheetHolderDto | null,
): Promise<SheetHolderPlacePo | null> {
  return harness.deps.holders.resolve(harness.daos, VHARN_ID, holder);
}

describe('SheetHolderService', () => {
  it('nobody holds a sheet without a holder, and nothing is locked nor written', async () => {
    const harness = new SheetsHarness();

    expect(await resolve(harness, null)).toBeNull();
    expect(harness.journal).toEqual([]);
  });

  it('the linked Lyra hands the sheet to her character; the unlinked Bram keeps it', async () => {
    const harness = new SheetsHarness();

    const lyra = await resolve(harness, { tokenId: LYRA_ID });
    const bram = await resolve(harness, { tokenId: BRAM_ID });

    expect(lyra).toEqual({ character: lyraPlace() });
    expect(bram).toEqual({ token: expect.objectContaining({ tokenId: BRAM_ID }) });
  });

  it('Bia and Caio, players, hand it to their characters; nothing is created', async () => {
    const harness = new SheetsHarness();

    const bia = await resolve(harness, { memberId: BIA_ID });
    const caio = await resolve(harness, { memberId: CAIO_ID });

    expect(bia).toEqual({ character: lyraPlace() });
    expect(caio).toEqual({
      character: expect.objectContaining({ characterId: KAEL_CHARACTER_ID }),
    });
    expect(harness.journal).toEqual([]);
    expect(harness.characters.rows).toHaveLength(4);
  });

  it.each([
    ['the master Ana, who has no character', ANA_ID],
    ['the spectator Duda, whose Mira is stored', DUDA_ID],
    ['a stranger', QUELM_TOKEN_ID],
  ])('%s is MEMBER_NOT_FOUND, citing the member', async (_who, memberId) => {
    const harness = new SheetsHarness();

    await expect(resolve(harness, { memberId })).rejects.toMatchObject({
      code: 'MEMBER_NOT_FOUND',
      message: expect.stringContaining(memberId),
    });
  });

  it('a token of Quelm is TOKEN_NOT_FOUND at Vharn, citing it', async () => {
    const harness = new SheetsHarness();

    await expect(resolve(harness, { tokenId: QUELM_TOKEN_ID })).rejects.toMatchObject({
      code: 'TOKEN_NOT_FOUND',
      message: expect.stringContaining(QUELM_TOKEN_ID),
    });
  });

  it('a saved sheet hangs on its character, its token or nobody', async () => {
    const harness = new SheetsHarness();
    const { holders } = harness.deps;

    const onLyra = await holders.placeOfSheet(harness.daos, sheetPo());
    const onBram = await holders.placeOfSheet(
      harness.daos,
      sheetPo({ characterId: null, tokenId: BRAM_ID }),
    );
    const unheld = await holders.placeOfSheet(harness.daos, sheetPo({ characterId: null }));

    expect(onLyra).toEqual({ character: lyraPlace() });
    expect(onBram).toEqual({ token: expect.objectContaining({ tokenId: BRAM_ID }) });
    expect(unheld).toBeNull();
  });

  it('a sheet on a character of another table is CHARACTER_NOT_FOUND', async () => {
    const harness = new SheetsHarness();
    harness.characters.rows.splice(0, 1);

    const placing = harness.deps.holders.placeOfSheet(harness.daos, sheetPo());

    await expect(placing).rejects.toMatchObject({
      code: 'CHARACTER_NOT_FOUND',
      message: expect.stringContaining(LYRA_CHARACTER_ID),
    });
  });
});
