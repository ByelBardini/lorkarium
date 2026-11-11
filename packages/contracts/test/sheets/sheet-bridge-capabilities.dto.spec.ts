import { describe, expect, it } from 'vitest';
import {
  ASSET_MAX_BYTES,
  CHARACTER_STAT_MAX,
  sheetFrameMessageDto,
  sheetHostMessageDto,
} from '../../src';

const assetId = '00000000-0000-4000-8000-000000000002';
const png = (byteLength = 4) => ({ type: 'image/png', bytes: new ArrayBuffer(byteLength) });

function issuesOf(input: unknown): string {
  const parsed = sheetFrameMessageDto.safeParse(input);
  return parsed.success ? '' : parsed.error.issues.map((issue) => issue.message).join('; ');
}

function stateWith(character: unknown): unknown {
  return { type: 'state', token: null, bars: [], values: {}, canEdit: true, character };
}

describe('state.character', () => {
  const lyra = { name: 'Lyra', armorClass: 15, difficultyClass: null };

  it('accepts the character with its AC and DC', () =>
    expect(sheetHostMessageDto.safeParse(stateWith(lyra)).success).toBe(true));
  it('accepts null: a loose token or a sheet with no holder', () =>
    expect(sheetHostMessageDto.safeParse(stateWith(null)).success).toBe(true));
  it('refuses an AC past the card limit', () =>
    expect(
      sheetHostMessageDto.safeParse(stateWith({ ...lyra, armorClass: CHARACTER_STAT_MAX + 1 }))
        .success,
    ).toBe(false));
  it('refuses a field the frame should not learn', () =>
    expect(sheetHostMessageDto.safeParse(stateWith({ ...lyra, id: assetId })).success).toBe(false));
  it('refuses a state without the character field', () =>
    expect(
      sheetHostMessageDto.safeParse({
        type: 'state',
        token: null,
        bars: [],
        values: {},
        canEdit: true,
      }).success,
    ).toBe(false));
});

describe('character.set', () => {
  const set = (changes: unknown) => ({ type: 'character.set', requestId: '1', changes });

  it('accepts AC alone and DC alone', () => {
    expect(sheetFrameMessageDto.parse(set({ armorClass: 14 }))).toEqual(set({ armorClass: 14 }));
    expect(sheetFrameMessageDto.safeParse(set({ difficultyClass: 0 })).success).toBe(true);
  });
  it('refuses empty changes, naming the fields it takes', () =>
    expect(issuesOf(set({}))).toContain('expected at least one of armorClass, difficultyClass'));
  it('refuses the name: the sheet writes only AC and DC', () =>
    expect(sheetFrameMessageDto.safeParse(set({ name: 'Outra' })).success).toBe(false));
  it.each([-1, CHARACTER_STAT_MAX + 1, 1.5, null])('refuses the AC %s, citing it', (armorClass) =>
    expect(issuesOf(set({ armorClass }))).not.toBe(''),
  );
  it('the refusal of an AC out of range cites the value', () =>
    expect(issuesOf(set({ armorClass: 1000 }))).toContain('1000'));
});

describe('character.setImage and assets.upload', () => {
  it.each(['character.setImage', 'assets.upload'])('%s accepts image bytes', (type) =>
    expect(sheetFrameMessageDto.safeParse({ type, requestId: '1', image: png() }).success).toBe(
      true,
    ),
  );
  it('accepts exactly 20 MiB and refuses one byte more, citing the size', () => {
    const at = { type: 'assets.upload', requestId: '1', image: png(ASSET_MAX_BYTES) };
    const over = { ...at, image: png(ASSET_MAX_BYTES + 1) };
    expect(sheetFrameMessageDto.safeParse(at).success).toBe(true);
    expect(issuesOf(over)).toContain(`${ASSET_MAX_BYTES + 1} bytes`);
  });
  it.each(['image/svg+xml', 'image/gif', 'text/html'])('refuses the type %s', (type) =>
    expect(
      sheetFrameMessageDto.safeParse({
        type: 'assets.upload',
        requestId: '1',
        image: { type, bytes: new ArrayBuffer(4) },
      }).success,
    ).toBe(false),
  );
  it('refuses bytes that are not an ArrayBuffer', () =>
    expect(
      sheetFrameMessageDto.safeParse({
        type: 'assets.upload',
        requestId: '1',
        image: { type: 'image/png', bytes: [1, 2, 3] },
      }).success,
    ).toBe(false));
  it('refuses a frame naming the sheet or the character', () =>
    expect(
      sheetFrameMessageDto.safeParse({
        type: 'character.setImage',
        requestId: '1',
        image: png(),
        characterId: assetId,
      }).success,
    ).toBe(false));
});

describe('assets.read', () => {
  it('accepts an asset id', () =>
    expect(sheetFrameMessageDto.parse({ type: 'assets.read', requestId: '1', assetId })).toEqual({
      type: 'assets.read',
      requestId: '1',
      assetId,
    }));
  it('refuses an id that is not a uuid', () =>
    expect(
      sheetFrameMessageDto.safeParse({ type: 'assets.read', requestId: '1', assetId: '../x' })
        .success,
    ).toBe(false));
});

describe('result with a value', () => {
  it('assets.upload answers the asset id', () =>
    expect(
      sheetHostMessageDto.safeParse({ type: 'result', requestId: '1', value: { assetId } }).success,
    ).toBe(true));
  it('assets.read answers the type and the bytes', () =>
    expect(
      sheetHostMessageDto.safeParse({
        type: 'result',
        requestId: '1',
        value: { type: 'image/webp', bytes: new ArrayBuffer(4) },
      }).success,
    ).toBe(true));
  it('a result with no value is still the plain answer', () =>
    expect(sheetHostMessageDto.parse({ type: 'result', requestId: '1' })).toEqual({
      type: 'result',
      requestId: '1',
    }));
  it('refuses a value of another shape', () =>
    expect(
      sheetHostMessageDto.safeParse({ type: 'result', requestId: '1', value: { url: 'x' } })
        .success,
    ).toBe(false));
});

describe('bars.spend', () => {
  const spend = (costs: unknown) => ({ type: 'bars.spend', requestId: '1', costs });

  it('accepts costs by bar name or id', () =>
    expect(
      sheetFrameMessageDto.parse(
        spend([
          { bar: 'MP', amount: 6 },
          { bar: assetId, amount: 1 },
        ]),
      ),
    ).toEqual(
      spend([
        { bar: 'MP', amount: 6 },
        { bar: assetId, amount: 1 },
      ]),
    ));
  it('refuses no cost and more than 8', () => {
    expect(sheetFrameMessageDto.safeParse(spend([])).success).toBe(false);
    const nine = Array.from({ length: 9 }, () => ({ bar: 'MP', amount: 1 }));
    expect(sheetFrameMessageDto.safeParse(spend(nine)).success).toBe(false);
  });
  it.each([0, -3, 1.5])('refuses the amount %s', (amount) =>
    expect(sheetFrameMessageDto.safeParse(spend([{ bar: 'MP', amount }])).success).toBe(false),
  );
  it('refuses a barId field: the host resolves the name', () =>
    expect(sheetFrameMessageDto.safeParse(spend([{ barId: assetId, amount: 1 }])).success).toBe(
      false,
    ));
});

describe('values.patch', () => {
  const patch = (patches: unknown) => ({ type: 'values.patch', requestId: '1', patches });

  it('accepts a path patch', () =>
    expect(
      sheetFrameMessageDto.parse(patch([{ path: ['hab', 'k3f9', 'efeito'], value: 'Cura' }])),
    ).toEqual(patch([{ path: ['hab', 'k3f9', 'efeito'], value: 'Cura' }])));
  it('refuses no patch', () =>
    expect(sheetFrameMessageDto.safeParse(patch([])).success).toBe(false));
  it('refuses a forbidden key anywhere on the path', () =>
    expect(issuesOf(patch([{ path: ['hab', '__proto__'], value: 1 }]))).toContain('__proto__'));
});

describe('bars.create', () => {
  const create = (bar: unknown) => ({ type: 'bars.create', requestId: '1', bar });

  it('accepts a label and a max, gold by default', () =>
    expect(sheetFrameMessageDto.parse(create({ label: 'Fôlego', max: 6 }))).toEqual(
      create({ label: 'Fôlego', max: 6, color: 'gold' }),
    ));
  it('refuses a hex color citing the palette', () =>
    expect(issuesOf(create({ label: 'Fôlego', max: 6, color: '#ff0000' }))).toContain(
      'expected one of gold',
    ));
  it('refuses a current value: the bar starts full', () =>
    expect(
      sheetFrameMessageDto.safeParse(create({ label: 'MP', max: 6, current: 1 })).success,
    ).toBe(false));
  it('answers with the bar id and whether it was created', () =>
    expect(
      sheetHostMessageDto.safeParse({
        type: 'result',
        requestId: '1',
        value: { barId: assetId, created: true },
      }).success,
    ).toBe(true));
});
