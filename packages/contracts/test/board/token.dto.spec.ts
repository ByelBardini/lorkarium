import { describe, expect, it } from 'vitest';
import {
  BAR_VALUE_LIMIT,
  MAX_BARS_PER_TOKEN,
  adjustBarCommandDto,
  createTokenCommandDto,
  moveTokenCommandDto,
  sightDto,
  tokenDto,
  updateTokenCommandDto,
} from '../../src/board/token.dto';
import { newTokenDto } from '../../src/board/token-group.dto';

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
      sightAngle: 360,
      bars: [
        { ...PV, display: 'number' },
        { ...INSPIRATION, display: 'number' },
      ],
    });
  });

  it('a bar sent as percent keeps it', () => {
    const bars = [{ ...PV, display: 'percent' }];
    expect(createTokenCommandDto.parse({ ...CREATE, bars }).bars[0]?.display).toBe('percent');
  });

  it('a bar display other than number or percent is refused on it', () => {
    const bars = [{ ...PV, display: 'fraction' }];
    expect(issuePathsOf({ ...CREATE, bars })).toEqual(['bars.0.display']);
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
    { op: 'max', value: 50 },
  ])('the change %o is accepted', (change) => {
    expect(adjustBarCommandDto.parse({ ...base, change }).change).toEqual(change);
  });

  it.each([0, BAR_VALUE_LIMIT + 1, 2.5])('a new maximum of %s is refused', (value) => {
    expect(adjustBarCommandDto.safeParse({ ...base, change: { op: 'max', value } }).success).toBe(
      false,
    );
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
      defeated: false,
      sightAngle: 360,
      sight: null,
      light: null,
      lightLit: true,
      canControl: false,
      bars: [bar(1), bar(2)],
      conditions: [],
    };
    expect(tokenDto.parse(token).bars.map((b) => b.position)).toEqual([1, 2]);
  });
});

describe('sightDto', () => {
  it.each([[{ bright: 12, dim: 4 }], [{ bright: 0, dim: 0 }]])(
    'a sight of %o is accepted as sent',
    (sight) => {
      expect(sightDto.parse(sight)).toEqual(sight);
    },
  );

  it.each([
    ['bright', 100.5],
    ['bright', -1],
    ['dim', Number.NaN],
  ])('a %s of %s is refused citing the value and 0 to 100 cells', (side, value) => {
    const result = sightDto.safeParse({ bright: 3, dim: 3, [side]: value });
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      `sight ${side} ${value} is invalid; expected 0 to 100 cells`,
    );
  });
});

describe('sight on create and update', () => {
  const UPDATE = { ...CREATE, tokenId: TOKEN_ID } as Record<string, unknown>;
  delete UPDATE.col;
  delete UPDATE.row;

  it('a token created with a sight keeps it', () => {
    const sight = { bright: 12, dim: 4 };
    expect(createTokenCommandDto.parse({ ...CREATE, sight }).sight).toEqual(sight);
  });

  it('an update with sight null (it stops seeing) is accepted', () => {
    expect(updateTokenCommandDto.parse({ ...UPDATE, sight: null }).sight).toBeNull();
  });

  it('an update without sight keeps it absent (the server keeps the current one)', () => {
    expect('sight' in updateTokenCommandDto.parse(UPDATE)).toBe(false);
  });
});

describe('light on the token', () => {
  const UPDATE = { ...CREATE, tokenId: TOKEN_ID } as Record<string, unknown>;
  delete UPDATE.col;
  delete UPDATE.row;
  const torch = { bright: 4, dim: 4 };

  it('a token created with a light keeps it, neutral when sent without color', () => {
    expect(createTokenCommandDto.parse({ ...CREATE, light: torch }).light).toEqual({
      ...torch,
      color: null,
      angle: 360,
    });
  });

  it('a token created with a fire light keeps the color', () => {
    const light = { ...torch, color: 'fire', angle: 360 };
    expect(createTokenCommandDto.parse({ ...CREATE, light }).light).toEqual(light);
  });

  it('an update with a light of color #f00 is refused on light.color', () => {
    const result = updateTokenCommandDto.safeParse({
      ...UPDATE,
      light: { ...torch, color: '#f00' },
    });
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['light.color']);
  });

  it('a pasted token keeps the moon color of its light', () => {
    const pasted = { ...CREATE } as Record<string, unknown>;
    delete pasted.actionId;
    delete pasted.campaignId;
    const light = { ...torch, color: 'moon', angle: 60 };
    expect(newTokenDto.parse({ ...pasted, light }).light).toEqual(light);
  });

  it('a token created lit or unlit is refused: a new token is always lit', () => {
    expect(createTokenCommandDto.safeParse({ ...CREATE, lightLit: false }).success).toBe(false);
  });

  it('an update with light null (it stops emitting light) is accepted', () => {
    expect(updateTokenCommandDto.parse({ ...UPDATE, light: null }).light).toBeNull();
  });

  it('an update without light keeps it absent (the server keeps the current one)', () => {
    expect('light' in updateTokenCommandDto.parse(UPDATE)).toBe(false);
  });

  it('an update with a light of 101 is refused citing the value', () => {
    const result = updateTokenCommandDto.safeParse({ ...UPDATE, light: { bright: 101, dim: 0 } });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'light bright 101 is invalid; expected 0 to 100 cells',
    ]);
  });
});

describe('defeated', () => {
  const UPDATE: Record<string, unknown> = { ...CREATE, tokenId: TOKEN_ID };
  delete UPDATE.col;
  delete UPDATE.row;
  const LYRA = {
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
    defeated: true,
    sightAngle: 360,
    sight: null,
    light: null,
    lightLit: true,
    canControl: false,
    bars: [],
    conditions: [],
  };

  // Only `token:restyleMany` marks a token: a new token (and a pasted copy) is never defeated.
  it.each([
    ['create', createTokenCommandDto, CREATE],
    ['update', updateTokenCommandDto, UPDATE],
  ] as const)('%s refuses it as an unknown field', (_name, schema, command) => {
    expect(schema.safeParse(command).success).toBe(true);
    expect(schema.safeParse({ ...command, defeated: true }).success).toBe(false);
  });

  it('a token carries it to every audience', () => {
    expect(tokenDto.parse(LYRA).defeated).toBe(true);
  });

  it('a token without it is refused on defeated', () => {
    const withoutDefeated: Record<string, unknown> = { ...LYRA };
    delete withoutDefeated.defeated;
    const result = tokenDto.safeParse(withoutDefeated);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['defeated']);
  });
});

describe('moveTokenCommandDto path', () => {
  const MOVE = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID, tokenId: TOKEN_ID, col: 6, row: 4 };
  const bends = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ col: i % 10, row: 1 }));

  it('a move with 32 bends is accepted, and without a path too', () => {
    expect(moveTokenCommandDto.safeParse({ ...MOVE, path: bends(32) }).success).toBe(true);
    expect(moveTokenCommandDto.safeParse(MOVE).success).toBe(true);
  });

  it('a path of 33 bends is refused citing 33 and 32', () => {
    const result = moveTokenCommandDto.safeParse({ ...MOVE, path: bends(33) });
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      'path has 33 bends; expected at most 32',
    );
  });

  it('a bend at col -1 is refused', () => {
    const result = moveTokenCommandDto.safeParse({ ...MOVE, path: [{ col: -1, row: 1 }] });
    expect(result.success).toBe(false);
  });
});

describe('the field of view and the lantern of a token', () => {
  const UPDATE = { ...CREATE, tokenId: TOKEN_ID } as Record<string, unknown>;
  delete UPDATE.col;
  delete UPDATE.row;
  const torch = { bright: 4, dim: 4 };

  it('a token created without sightAngle sees every side (360)', () => {
    expect(createTokenCommandDto.parse(CREATE).sightAngle).toBe(360);
  });

  it('a token created with a sightAngle of 90 keeps it', () => {
    expect(createTokenCommandDto.parse({ ...CREATE, sightAngle: 90 }).sightAngle).toBe(90);
  });

  it('an update without sightAngle keeps it absent (the server keeps the current one)', () => {
    expect('sightAngle' in updateTokenCommandDto.parse(UPDATE)).toBe(false);
  });

  it('a confirmed token without sightAngle is refused: the event always carries it', () => {
    const created = createTokenCommandDto.parse(CREATE);
    const token = {
      ...created,
      id: TOKEN_ID,
      actionId: undefined,
      campaignId: undefined,
      defeated: false,
      sight: null,
      light: null,
      lightLit: true,
      canControl: false,
      bars: [],
      conditions: [],
    } as Record<string, unknown>;
    delete token.actionId;
    delete token.campaignId;
    delete token.sightAngle;
    const result = tokenDto.safeParse(token);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['sightAngle']);
  });

  it('a lantern sent without angle shines every side (360), and with 60 keeps it', () => {
    expect(createTokenCommandDto.parse({ ...CREATE, light: torch }).light?.angle).toBe(360);
    const lantern = { ...torch, angle: 60 };
    expect(createTokenCommandDto.parse({ ...CREATE, light: lantern }).light?.angle).toBe(60);
  });

  it('a sightAngle of 361 is refused on sightAngle citing the value', () => {
    const result = updateTokenCommandDto.safeParse({ ...UPDATE, sightAngle: 361 });
    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['sightAngle', 'sight angle 361 is invalid; expected a whole number from 1 to 360'],
    ]);
  });

  it('a lantern angle of 0 is refused on light.angle citing the value', () => {
    const result = updateTokenCommandDto.safeParse({ ...UPDATE, light: { ...torch, angle: 0 } });
    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['light.angle', 'light angle 0 is invalid; expected a whole number from 1 to 360'],
    ]);
  });
});
