import { describe, expect, it } from 'vitest';
import {
  BAR_VALUE_LIMIT,
  MAX_BARS_PER_TOKEN,
  adjustBarCommandDto,
  createTokenCommandDto,
  tokenDto,
} from '../../src/board/token.dto';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const CAMPAIGN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const TOKEN_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const BIA_ID = '9c2f4e61-7a3b-4d5c-8e9f-0b1a2c3d4e5f';
const BAR_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

const PV = {
  label: 'PV',
  current: 32,
  max: 45,
  color: 'ember',
  visibility: 'controllers',
} as const;
const INSPIRATION = {
  label: 'Inspiração',
  current: 1,
  max: 1,
  color: 'gold',
  visibility: 'everyone',
} as const;

const CREATE = {
  actionId: ACTION_ID,
  campaignId: CAMPAIGN_ID,
  name: 'Lyra',
  initials: 'LY',
  side: 'ally',
  width: 1,
  height: 1,
  col: 3,
  row: 4,
  controllerIds: [BIA_ID],
  bars: [PV, INSPIRATION],
};

function issuePathsOf(input: unknown): string[] {
  const result = createTokenCommandDto.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => [...issue.path, ...keysOf(issue)].join('.'));
}

function keysOf(issue: object): string[] {
  return 'keys' in issue && Array.isArray(issue.keys) ? issue.keys : [];
}

describe('createTokenCommandDto', () => {
  it('a token with two bars and no layer is accepted on the tokens layer', () => {
    expect(createTokenCommandDto.parse(CREATE)).toEqual({
      ...CREATE,
      layer: 'tokens',
      imageAssetId: null,
      frame: 'square',
      flipX: false,
      flipY: false,
      facing: 0,
    });
  });

  it('a token sent on the objects layer keeps it', () => {
    expect(createTokenCommandDto.parse({ ...CREATE, layer: 'objects' }).layer).toBe('objects');
  });

  it('the name is trimmed', () => {
    expect(createTokenCommandDto.parse({ ...CREATE, name: '  Lyra ' }).name).toBe('Lyra');
  });

  it(`${MAX_BARS_PER_TOKEN} bars pass and one more is refused on bars`, () => {
    expect(issuePathsOf({ ...CREATE, bars: Array(8).fill(PV) })).toEqual([]);
    expect(issuePathsOf({ ...CREATE, bars: Array(9).fill(PV) })).toEqual(['bars']);
  });

  it(`a current of -${BAR_VALUE_LIMIT} passes and one below is refused`, () => {
    const at = (current: number) => ({ ...CREATE, bars: [{ ...PV, current }] });
    expect(issuePathsOf(at(-BAR_VALUE_LIMIT))).toEqual([]);
    expect(issuePathsOf(at(-BAR_VALUE_LIMIT - 1))).toEqual(['bars.0.current']);
  });

  it('a maximum of 0 is refused on max', () => {
    expect(issuePathsOf({ ...CREATE, bars: [{ ...PV, max: 0 }] })).toEqual(['bars.0.max']);
  });

  it.each(['L', 'LYR'])('initials "%s" pass', (initials) => {
    expect(issuePathsOf({ ...CREATE, initials })).toEqual([]);
  });

  it.each(['', 'LYRA'])('initials "%s" are refused', (initials) => {
    expect(issuePathsOf({ ...CREATE, initials })).toEqual(['initials']);
  });

  it.each([0.5, 2.5, 10])('width %s passes (half-cell steps up to ten)', (width) => {
    expect(issuePathsOf({ ...CREATE, width })).toEqual([]);
  });

  it.each([0, 0.25, 10.5])('height %s is refused', (height) => {
    expect(issuePathsOf({ ...CREATE, height })).toEqual(['height']);
  });

  it('a half-cell position passes and a quarter cell is refused citing the value', () => {
    expect(issuePathsOf({ ...CREATE, col: 1.5 })).toEqual([]);
    const result = createTokenCommandDto.safeParse({ ...CREATE, row: 1.25 });
    expect(result.error?.issues.map(({ message }) => message)).toEqual([
      expect.stringMatching(/1\.25.*multiple of 0\.5/),
    ]);
  });

  it('side "boss" is refused', () => {
    expect(issuePathsOf({ ...CREATE, side: 'boss' })).toEqual(['side']);
  });

  it('a color outside the five is refused', () => {
    expect(issuePathsOf({ ...CREATE, bars: [{ ...PV, color: '#ff0000' }] })).toEqual([
      'bars.0.color',
    ]);
  });

  it('canControl in a command is refused (the server decides it)', () => {
    expect(issuePathsOf({ ...CREATE, canControl: true })).toEqual(['canControl']);
  });
});

describe('adjustBarCommandDto', () => {
  const base = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID, tokenId: TOKEN_ID, barId: BAR_ID };

  it.each([
    { op: 'add', amount: -7 },
    { op: 'set', value: 12 },
  ])('the change %o is accepted', (change) => {
    expect(adjustBarCommandDto.parse({ ...base, change }).change).toEqual(change);
  });

  it('a fractional amount is refused', () => {
    expect(
      adjustBarCommandDto.safeParse({ ...base, change: { op: 'add', amount: 1.5 } }).success,
    ).toBe(false);
  });
});

describe('tokenDto', () => {
  it('a redacted token keeps the positions of the bars it still has (1 and 2, no 0)', () => {
    const bar = (position: number) => ({ ...INSPIRATION, id: BAR_ID, position });
    const token = {
      id: TOKEN_ID,
      name: 'Lyra',
      initials: 'LY',
      side: 'ally',
      width: 1,
      height: 1,
      col: 3,
      row: 4,
      layer: 'tokens',
      controllerIds: [BIA_ID],
      imageAssetId: null,
      frame: 'square',
      flipX: false,
      flipY: false,
      facing: 0,
      canControl: false,
      bars: [bar(1), bar(2)],
      conditions: [],
    };
    expect(tokenDto.parse(token).bars.map((b) => b.position)).toEqual([1, 2]);
  });
});
