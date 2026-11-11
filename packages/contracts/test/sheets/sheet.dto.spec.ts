import { describe, expect, it } from 'vitest';
import {
  createSheetBarRequestDto,
  createSheetBarResponseDto,
  createSheetRequestDto,
  sheetAdjustBarCommandDto,
  sheetChangedEventDto,
  sheetDto,
  sheetReceiptDto,
  sheetSpendBarsCommandDto,
  sheetSummaryDto,
  tokenSheetsResponseDto,
  updateSheetRequestDto,
} from '../../src';

const actionId = '00000000-0000-4000-8000-000000000001';
const campaignId = '00000000-0000-4000-8000-000000000002';
const sheetId = '00000000-0000-4000-8000-000000000003';
const tokenId = '00000000-0000-4000-8000-000000000004';
const barId = '00000000-0000-4000-8000-000000000005';
const memberId = '00000000-0000-4000-8000-000000000006';
const lyraSummary = {
  id: sheetId,
  name: 'Lyra',
  folderId: null,
  templateId: actionId,
  tokenId,
  memberId,
  visibility: 'controllers',
  version: 4,
};
const lyraSheet = { ...lyraSummary, values: { forca: 16 }, canEdit: true, canManage: false };
const adjust = { actionId, campaignId, sheetId, barId, change: { op: 'add', amount: -5 } };
const create = { actionId, templateId: actionId, name: 'Lyra' };
const spend = { actionId, campaignId, sheetId, costs: [{ barId, amount: 6 }] };

describe('sheet', () => {
  it.each(['controllers', 'table'])('accepts the visibility %s', (visibility) =>
    expect(sheetDto.parse({ ...lyraSheet, visibility }).visibility).toBe(visibility),
  );
  it.each(['secret', 'public', 'masters'])('refuses the visibility %s', (visibility) =>
    expect(sheetDto.safeParse({ ...lyraSheet, visibility }).success).toBe(false),
  );
  it('refuses a sheet whose values break the values budget', () =>
    expect(sheetDto.safeParse({ ...lyraSheet, values: { 'com espaço': 1 } }).success).toBe(false));
  it('accepts a sheet without a holder, token and member null', () =>
    expect(sheetDto.parse({ ...lyraSheet, tokenId: null, memberId: null }).tokenId).toBeNull());
  it('refuses a sheet without a name', () => {
    expect(sheetDto.safeParse({ ...lyraSheet, name: undefined }).success).toBe(false);
  });
  it('a summary carries no values, and the list of a token is of summaries', () => {
    expect(sheetSummaryDto.safeParse({ ...lyraSummary, values: {} }).success).toBe(false);
    expect(tokenSheetsResponseDto.parse({ sheets: [lyraSummary] }).sheets).toHaveLength(1);
  });
  it('trims the name and refuses 61 characters', () => {
    expect(sheetSummaryDto.parse({ ...lyraSummary, name: '  Lyra  ' }).name).toBe('Lyra');
    const long = { ...lyraSummary, name: 'a'.repeat(61) };
    expect(sheetSummaryDto.safeParse(long).success).toBe(false);
    expect(sheetSummaryDto.safeParse({ ...long, name: 'a'.repeat(60) }).success).toBe(true);
  });
});

describe('sheet commands', () => {
  it('creates a sheet without a holder nor visibility, leaving both to the server', () =>
    expect(createSheetRequestDto.parse(create)).toEqual(create));
  it.each([
    ['a token', { tokenId }],
    ['a player', { memberId }],
  ])('creates a sheet held by %s', (_who, holder) =>
    expect(createSheetRequestDto.parse({ ...create, holder }).holder).toEqual(holder),
  );
  it.each([
    ['both ids', { tokenId, memberId }],
    ['no id', {}],
    ['a userId', { userId: memberId }],
  ])('refuses a holder with %s', (_what, holder) =>
    expect(createSheetRequestDto.safeParse({ ...create, holder }).success).toBe(false),
  );
  it('refuses a create without a name, and the old tokenId at the root', () => {
    expect(createSheetRequestDto.safeParse({ actionId, templateId: actionId }).success).toBe(false);
    expect(createSheetRequestDto.safeParse({ ...create, tokenId }).success).toBe(false);
  });
  it('refuses an update with nothing to change', () =>
    expect(updateSheetRequestDto.safeParse({ actionId }).error?.issues[0]?.message).toBe(
      'changes is empty; expected at least one of name, folderId, visibility, templateId, holder',
    ));
  it.each([
    ['takes the sheet from its holder', { holder: null }],
    ['moves it to the root', { folderId: null }],
    ['renames it', { name: 'Lyra, a Ruiva' }],
    ['gives it to a player', { holder: { memberId } }],
  ])('an update %s', (_what, change) =>
    expect(updateSheetRequestDto.safeParse({ actionId, ...change }).success).toBe(true),
  );
  it('refuses moving a sheet to another token outside the holder', () =>
    expect(updateSheetRequestDto.safeParse({ actionId, tokenId }).success).toBe(false));
});

describe('sheet events', () => {
  it('accepts sheet:adjustBar with a bar change', () =>
    expect(sheetAdjustBarCommandDto.parse(adjust)).toEqual(adjust));
  it.each([
    ['tokenId', tokenId],
    ['sceneId', campaignId],
    ['userId', actionId],
  ])('refuses sheet:adjustBar carrying %s', (field, value) =>
    expect(sheetAdjustBarCommandDto.safeParse({ ...adjust, [field]: value }).success).toBe(false),
  );
  it('refuses sheet:changed carrying values', () =>
    expect(
      sheetChangedEventDto.safeParse({
        campaignId,
        sheetId,
        version: 4,
        at: '2026-10-31T12:00:00.000Z',
        values: { forca: 16 },
      }).success,
    ).toBe(false));
});

describe('sheet:spendBars', () => {
  const cost = (amount: number) => ({ barId, amount });
  const costsOf = (count: number) => Array.from({ length: count }, () => cost(1));

  it('accepts one cost', () => expect(sheetSpendBarsCommandDto.parse(spend)).toEqual(spend));

  it('accepts 8 costs, the same bar repeated', () =>
    expect(sheetSpendBarsCommandDto.parse({ ...spend, costs: costsOf(8) }).costs).toHaveLength(8));

  it.each([
    ['no cost', []],
    ['9 costs', costsOf(9)],
    ['a cost of 0', [cost(0)]],
    ['a negative cost', [cost(-2)]],
    ['a fractional cost', [cost(1.5)]],
    ['a cost past the bar limit', [cost(100_000)]],
    ['a bar that is not a uuid', [{ barId: 'MP', amount: 1 }]],
    ['a cost with an extra field', [{ barId, amount: 1, temp: true }]],
  ])('refuses %s', (_case, costs) =>
    expect(sheetSpendBarsCommandDto.safeParse({ ...spend, costs }).success).toBe(false),
  );

  it('accepts a cost at the bar limit', () =>
    expect(sheetSpendBarsCommandDto.parse({ ...spend, costs: [cost(99_999)] }).costs).toEqual([
      cost(99_999),
    ]));

  it.each([
    ['tokenId', tokenId],
    ['sceneId', campaignId],
    ['userId', actionId],
  ])('refuses sheet:spendBars carrying %s', (field, value) =>
    expect(sheetSpendBarsCommandDto.safeParse({ ...spend, [field]: value }).success).toBe(false),
  );
});

describe('sheet receipt', () => {
  const receipt = { actionId, sheetId, version: 5, operation: 'update' };

  it('reads a receipt saved without skippedBars as none skipped', () =>
    expect(sheetReceiptDto.parse(receipt).skippedBars).toEqual([]));

  it('keeps the labels of the bars that did not fit', () =>
    expect(sheetReceiptDto.parse({ ...receipt, skippedBars: ['ES'] }).skippedBars).toEqual(['ES']));

  it.each([
    ['an empty label', ['']],
    ['9 labels', Array.from({ length: 9 }, (_, index) => `B${index}`)],
    ['a label of 25', ['x'.repeat(25)]],
  ])('refuses skippedBars with %s', (_case, skippedBars) =>
    expect(sheetReceiptDto.safeParse({ ...receipt, skippedBars }).success).toBe(false),
  );
});

describe('createSheetBarRequestDto', () => {
  const request = (bar: unknown) => createSheetBarRequestDto.safeParse({ bar });
  const issue = (bar: unknown) => {
    const parsed = request(bar);
    return parsed.success ? 'accepted' : parsed.error.issues.map(({ message }) => message).join();
  };

  it('fills a missing color with gold and trims the label', () =>
    expect(createSheetBarRequestDto.parse({ bar: { label: ' Fôlego ', max: 6 } })).toEqual({
      bar: { label: 'Fôlego', max: 6, color: 'gold' },
    }));
  it('keeps a palette color', () =>
    expect(request({ label: 'MP', max: 3, color: 'moss' }).data?.bar.color).toBe('moss'));
  it('refuses a hex color citing it and the palette', () =>
    expect(issue({ label: 'MP', max: 3, color: '#ff0000' })).toBe(
      'bar color "#ff0000"; expected one of gold, steel, ember, moss, ash',
    ));
  it.each([
    ['a blank label', { label: '  ', max: 3 }],
    ['a label of 25', { label: 'x'.repeat(25), max: 3 }],
    ['a max of 0', { label: 'MP', max: 0 }],
    ['a max past the bar limit', { label: 'MP', max: 100_000 }],
    ['a fractional max', { label: 'MP', max: 2.5 }],
    ['an extra field', { label: 'MP', max: 3, current: 1 }],
  ])('refuses %s', (_case, bar) => expect(request(bar).success).toBe(false));
  it('accepts a label of 24 and the bar limit', () =>
    expect(issue({ label: 'x'.repeat(24), max: 99_999 })).toBe('accepted'));
  it('refuses a tokenId beside the bar', () =>
    expect(
      createSheetBarRequestDto.safeParse({ bar: { label: 'MP', max: 3 }, tokenId }).success,
    ).toBe(false));
});

describe('createSheetBarResponseDto', () => {
  it('accepts the bar id and whether it was created', () =>
    expect(createSheetBarResponseDto.parse({ barId, created: false })).toEqual({
      barId,
      created: false,
    }));
  it('refuses a bar id that is not a uuid', () =>
    expect(createSheetBarResponseDto.safeParse({ barId: 'MP', created: true }).success).toBe(
      false,
    ));
});
