import type { SheetHolderDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import type { ResolvedHolder } from '../../../src/modules/sheets/sheet-holder.service';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { VHARN_CAST_ID } from '../../support/scenes-factories';
import { LYRA_ANCHOR_ID, QUELM_TOKEN_ID, SheetsHarness } from '../../support/sheets-fakes';
import { BRAM_ID, LYRA_ID } from '../../support/tokens-factories';

function resolve(harness: SheetsHarness, holder: SheetHolderDto | null): Promise<ResolvedHolder> {
  return harness.deps.holders.resolve(harness.daos, VHARN_ID, holder);
}

describe('SheetHolderService', () => {
  it('nobody holds a sheet without a holder, and nothing is locked', async () => {
    const harness = new SheetsHarness();

    expect(await resolve(harness, null)).toEqual({ place: null, created: null });
    expect(harness.scenes.journal).toEqual([]);
  });

  it('the linked Lyra gives the sheet to her anchor; the unlinked Bram keeps it', async () => {
    const harness = new SheetsHarness();

    const lyra = await resolve(harness, { tokenId: LYRA_ID });
    const bram = await resolve(harness, { tokenId: BRAM_ID });

    expect([lyra.place?.tokenId, bram.place?.tokenId]).toEqual([LYRA_ANCHOR_ID, BRAM_ID]);
    expect(lyra.place?.memberId).toBe(BIA_ID);
  });

  it('a token of Quelm is TOKEN_NOT_FOUND at Vharn', async () => {
    const harness = new SheetsHarness();

    await expect(resolve(harness, { tokenId: QUELM_TOKEN_ID })).rejects.toMatchObject({
      code: 'TOKEN_NOT_FOUND',
    });
  });

  it('Bia, with a character, holds it on her anchor after the cast is locked', async () => {
    const harness = new SheetsHarness();

    const bia = await resolve(harness, { memberId: BIA_ID });

    expect(bia).toEqual({
      place: expect.objectContaining({ tokenId: LYRA_ANCHOR_ID }),
      created: null,
    });
    expect(harness.scenes.journal).toEqual(['lock cast']);
  });

  it('Caio, without one, gets an anchor in the cast (version 3) and his card (version 4)', async () => {
    const harness = new SheetsHarness();

    const { place, created } = await resolve(harness, { memberId: CAIO_ID });

    expect(place).toMatchObject({ sceneId: VHARN_CAST_ID, kind: 'cast', memberId: CAIO_ID });
    expect(created?.createdIn).toEqual({ sceneId: VHARN_CAST_ID, version: 3 });
    expect(created?.cardIn).toEqual({ sceneId: VHARN_CAST_ID, version: 4 });
    expect(created?.card).toMatchObject({ userId: CAIO_ID, anchorTokenId: place?.tokenId });
    expect(harness.board.tokenChanges).toEqual([]);
  });

  it('publishing the created anchor sends token:created to the cast, then the card', async () => {
    const harness = new SheetsHarness();
    const { created } = await resolve(harness, { memberId: CAIO_ID });
    harness.journal.length = 0;

    harness.deps.holders.publishCreated(VHARN_ID, created);
    harness.deps.holders.publishCreated(VHARN_ID, null);

    expect(harness.board.tokenChanges.map(({ name, sceneId }) => [name, sceneId])).toEqual([
      ['token:created', VHARN_CAST_ID],
    ]);
    expect(harness.board.memberCardChanges.map(({ version }) => version)).toEqual([4]);
    expect(harness.journal).toEqual(['publish', 'publish']);
  });
});
