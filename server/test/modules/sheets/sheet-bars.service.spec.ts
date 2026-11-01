import { describe, expect, it } from 'vitest';
import type {
  AdjustCharacterBar,
  CharactersService,
} from '../../../src/modules/characters/characters.service';
import { SheetBarsService } from '../../../src/modules/sheets/sheet-bars.service';
import type { AdjustBar, TokensService } from '../../../src/modules/tokens/tokens.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { LYRA_CHARACTER_ID, LYRA_CHARACTER_PV_ID } from '../../support/characters-factories';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';
import { LYRA_SHEET_ID, QUELM_SHEET_ID, SheetsHarness } from '../../support/sheets-fakes';
import { BRAM_ID, LYRA_PV_ID } from '../../support/tokens-factories';

/** Records each bar handed to the tokens service and answers version 7. */
class TokenBarsFake implements Pick<TokensService, 'adjustBar'> {
  readonly calls: Array<Readonly<{ userId: string; campaignId: string; bar: AdjustBar }>> = [];
  async adjustBar(userId: string, campaignId: string, bar: AdjustBar): Promise<number> {
    this.calls.push({ userId, campaignId, bar });
    return 7;
  }
}

/** Records each bar handed to the characters service and answers version 5. */
class CharacterBarsFake implements Pick<CharactersService, 'adjustBar'> {
  readonly calls: Array<Readonly<{ userId: string; bar: AdjustCharacterBar }>> = [];
  async adjustBar(userId: string, _campaignId: string, bar: AdjustCharacterBar): Promise<number> {
    this.calls.push({ userId, bar });
    return 5;
  }
}

const CHANGE = { op: 'add', amount: -7 } as const;

type Bars = Readonly<{ tokens: TokenBarsFake; characters: CharacterBarsFake }>;

function serviceOf(harness: SheetsHarness, bars: Bars): SheetBarsService {
  const { members, sheets } = harness;
  const { holders } = harness.deps;
  return new SheetBarsService({ members, sheets, holders, ...bars });
}

function barsFakes(): Bars {
  return { tokens: new TokenBarsFake(), characters: new CharacterBarsFake() };
}

describe('SheetBarsService', () => {
  it("Bia, through Lyra's sheet, takes 7 PV from her character: the characters' version answers", async () => {
    const harness = new SheetsHarness().withLyraSheet();
    const bars = barsFakes();

    const version = await serviceOf(harness, bars).adjustBar(BIA_ID, VHARN_ID, {
      ...{ sheetId: LYRA_SHEET_ID, barId: LYRA_CHARACTER_PV_ID, change: CHANGE },
    });

    expect(version).toBe(5);
    expect(bars.characters.calls).toEqual([
      {
        userId: BIA_ID,
        bar: { characterId: LYRA_CHARACTER_ID, barId: LYRA_CHARACTER_PV_ID, change: CHANGE },
      },
    ]);
    expect(bars.tokens.calls).toEqual([]);
  });

  it('the sheet of an unlinked token adjusts it on its own grid', async () => {
    const harness = new SheetsHarness().withLyraSheet({ characterId: null, tokenId: BRAM_ID });
    const bars = barsFakes();

    const version = await serviceOf(harness, bars).adjustBar(CAIO_ID, VHARN_ID, {
      ...{ sheetId: LYRA_SHEET_ID, barId: LYRA_PV_ID, change: CHANGE },
    });

    expect(version).toBe(7);
    expect(bars.tokens.calls[0]?.bar).toEqual({
      ...{ tokenId: BRAM_ID, sceneId: VHARN_SCENE_ID, barId: LYRA_PV_ID, change: CHANGE },
    });
    expect(bars.characters.calls).toEqual([]);
  });

  it('Caio on a table sheet of Lyra is FORBIDDEN and no bar is touched', async () => {
    const harness = new SheetsHarness().withLyraSheet({ visibility: 'table' });
    const bars = barsFakes();

    const adjusting = serviceOf(harness, bars).adjustBar(CAIO_ID, VHARN_ID, {
      ...{ sheetId: LYRA_SHEET_ID, barId: LYRA_CHARACTER_PV_ID, change: CHANGE },
    });

    await expect(adjusting).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect([bars.characters.calls, bars.tokens.calls]).toEqual([[], []]);
  });

  it('the sheet of Quelm at Vharn is SHEET_NOT_FOUND', async () => {
    const harness = new SheetsHarness();
    const bars = barsFakes();

    const adjusting = serviceOf(harness, bars).adjustBar(BIA_ID, VHARN_ID, {
      ...{ sheetId: QUELM_SHEET_ID, barId: LYRA_PV_ID, change: CHANGE },
    });

    await expect(adjusting).rejects.toMatchObject({ code: 'SHEET_NOT_FOUND' });
    expect(bars.tokens.calls).toEqual([]);
  });

  it.each([
    ['Ana', 'SHEET_HAS_NO_TOKEN', ANA_ID],
    ['Bia', 'SHEET_NOT_FOUND', BIA_ID],
  ])(
    '%s through a sheet nobody holds gets %s and no bar is touched',
    async (_who, code, userId) => {
      const harness = new SheetsHarness().withLyraSheet({ characterId: null });
      const bars = barsFakes();

      const adjusting = serviceOf(harness, bars).adjustBar(userId, VHARN_ID, {
        ...{ sheetId: LYRA_SHEET_ID, barId: LYRA_PV_ID, change: CHANGE },
      });

      await expect(adjusting).rejects.toMatchObject({ code });
      expect([bars.characters.calls, bars.tokens.calls]).toEqual([[], []]);
    },
  );
});
