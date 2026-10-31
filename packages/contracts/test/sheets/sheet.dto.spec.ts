import { describe, expect, it } from 'vitest';
import {
  createSheetRequestDto,
  sheetAdjustBarCommandDto,
  sheetChangedEventDto,
  sheetDto,
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
