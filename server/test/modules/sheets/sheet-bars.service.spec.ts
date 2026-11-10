import { describe, expect, it } from 'vitest';
import type {
  AdjustCharacterBar,
  CharacterBarsRewrite,
  CharactersService,
} from '../../../src/modules/characters/characters.service';
import { SheetBarsService } from '../../../src/modules/sheets/sheet-bars.service';
import type {
  TokenBarsAddress,
  TokenBarsRewrite,
  TokenBarWrite,
} from '../../../src/modules/tokens/token-bar-writes';
import type { AdjustBar, TokensService } from '../../../src/modules/tokens/tokens.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import {
  LYRA_CHARACTER_ID,
  LYRA_CHARACTER_MANA_ID,
  LYRA_CHARACTER_PV_ID,
  characterBarPo,
  characterManaPo,
} from '../../support/characters-factories';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';
import { LYRA_SHEET_ID, QUELM_SHEET_ID, SheetsHarness } from '../../support/sheets-fakes';
import { BRAM_ID, LYRA_PV_ID, pvBar } from '../../support/tokens-factories';

type Rewrite = Readonly<{ userId: string; target: unknown; writes: readonly TokenBarWrite[] }>;

/** Records each bar handed to the tokens service and answers version 7; a rewrite runs its rule
 *  on Lyra's PV (32/45) and records the writes it answered. */
class TokenBarsFake implements Pick<TokensService, 'adjustBar' | 'rewriteBars'> {
  readonly calls: Array<Readonly<{ userId: string; campaignId: string; bar: AdjustBar }>> = [];
  readonly rewrites: Rewrite[] = [];
  async adjustBar(userId: string, campaignId: string, bar: AdjustBar): Promise<number> {
    this.calls.push({ userId, campaignId, bar });
    return 7;
  }
  async rewriteBars(
    userId: string,
    _campaignId: string,
    target: TokenBarsAddress,
    rule: TokenBarsRewrite,
  ): Promise<number> {
    this.rewrites.push({ userId, target, writes: rule([pvBar()]) });
    return 7;
  }
}

/** Records each bar handed to the characters service and answers version 5; a rewrite runs its
 *  rule on Lyra's PV (25/30) and Mana (4/10). */
class CharacterBarsFake implements Pick<CharactersService, 'adjustBar' | 'rewriteBars'> {
  readonly calls: Array<Readonly<{ userId: string; bar: AdjustCharacterBar }>> = [];
  readonly rewrites: Rewrite[] = [];
  async adjustBar(userId: string, _campaignId: string, bar: AdjustCharacterBar): Promise<number> {
    this.calls.push({ userId, bar });
    return 5;
  }
  async rewriteBars(
    userId: string,
    _campaignId: string,
    target: string,
    rule: CharacterBarsRewrite,
  ): Promise<number> {
    this.rewrites.push({ userId, target, writes: rule([characterBarPo(), characterManaPo()]) });
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

describe('SheetBarsService.spendBars', () => {
  const PV_AND_MANA = [
    { barId: LYRA_CHARACTER_PV_ID, amount: 5 },
    { barId: LYRA_CHARACTER_MANA_ID, amount: 4 },
  ];

  it("Bia, through Lyra's sheet, pays PV 5 and Mana 4 from her character in one rewrite", async () => {
    const harness = new SheetsHarness().withLyraSheet();
    const bars = barsFakes();

    const version = await serviceOf(harness, bars).spendBars(BIA_ID, VHARN_ID, {
      ...{ sheetId: LYRA_SHEET_ID, costs: PV_AND_MANA },
    });

    expect(version).toBe(5);
    expect(bars.characters.rewrites).toEqual([
      {
        userId: BIA_ID,
        target: LYRA_CHARACTER_ID,
        writes: [
          { barId: LYRA_CHARACTER_PV_ID, values: { current: 20, max: 30, temp: 0 } },
          { barId: LYRA_CHARACTER_MANA_ID, values: { current: 0, max: 10, temp: 0 } },
        ],
      },
    ]);
    expect(bars.tokens.rewrites).toEqual([]);
  });

  it('Mana 4 cannot pay 5: INSUFFICIENT_BAR citing Mana, and no write is answered', async () => {
    const harness = new SheetsHarness().withLyraSheet();
    const bars = barsFakes();

    const spending = serviceOf(harness, bars).spendBars(BIA_ID, VHARN_ID, {
      ...{ sheetId: LYRA_SHEET_ID, costs: [{ barId: LYRA_CHARACTER_MANA_ID, amount: 5 }] },
    });

    await expect(spending).rejects.toMatchObject({
      code: 'INSUFFICIENT_BAR',
      message: 'Bar "Mana" has 4; expected at least 5',
    });
    expect(bars.characters.rewrites).toEqual([]);
  });

  it('the sheet of an unlinked token pays from the token on its own grid', async () => {
    const harness = new SheetsHarness().withLyraSheet({ characterId: null, tokenId: BRAM_ID });
    const bars = barsFakes();

    const version = await serviceOf(harness, bars).spendBars(CAIO_ID, VHARN_ID, {
      ...{ sheetId: LYRA_SHEET_ID, costs: [{ barId: LYRA_PV_ID, amount: 2 }] },
    });

    expect(version).toBe(7);
    expect(bars.tokens.rewrites).toEqual([
      {
        userId: CAIO_ID,
        target: { tokenId: BRAM_ID, sceneId: VHARN_SCENE_ID },
        writes: [{ barId: LYRA_PV_ID, values: { current: 30, max: 45, temp: 0 } }],
      },
    ]);
  });

  it('Caio on a table sheet of Lyra is FORBIDDEN and nothing is rewritten', async () => {
    const harness = new SheetsHarness().withLyraSheet({ visibility: 'table' });
    const bars = barsFakes();

    const spending = serviceOf(harness, bars).spendBars(CAIO_ID, VHARN_ID, {
      ...{ sheetId: LYRA_SHEET_ID, costs: PV_AND_MANA },
    });

    await expect(spending).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect([bars.characters.rewrites, bars.tokens.rewrites]).toEqual([[], []]);
  });

  it('the sheet of Quelm at Vharn is SHEET_NOT_FOUND', async () => {
    const bars = barsFakes();

    const spending = serviceOf(new SheetsHarness(), bars).spendBars(BIA_ID, VHARN_ID, {
      ...{ sheetId: QUELM_SHEET_ID, costs: PV_AND_MANA },
    });

    await expect(spending).rejects.toMatchObject({ code: 'SHEET_NOT_FOUND' });
    expect([bars.characters.rewrites, bars.tokens.rewrites]).toEqual([[], []]);
  });

  it('Ana through a sheet nobody holds gets SHEET_HAS_NO_TOKEN', async () => {
    const harness = new SheetsHarness().withLyraSheet({ characterId: null });
    const bars = barsFakes();

    const spending = serviceOf(harness, bars).spendBars(ANA_ID, VHARN_ID, {
      ...{ sheetId: LYRA_SHEET_ID, costs: PV_AND_MANA },
    });

    await expect(spending).rejects.toMatchObject({ code: 'SHEET_HAS_NO_TOKEN' });
    expect([bars.characters.rewrites, bars.tokens.rewrites]).toEqual([[], []]);
  });
});
