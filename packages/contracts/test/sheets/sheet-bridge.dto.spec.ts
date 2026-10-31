import { describe, expect, it } from 'vitest';
import {
  SHEET_CONSOLE_MESSAGE_MAX_LENGTH,
  SHEET_CONSOLE_POSITIONS_MAX,
  sheetFrameMessageDto,
  sheetHostMessageDto,
} from '../../src';

const id = '00000000-0000-4000-8000-000000000001';
const adjust = {
  type: 'bars.adjust',
  requestId: '1',
  bar: 'PV',
  change: { op: 'add', amount: -5 },
};
const hp = {
  id,
  position: 0,
  label: 'PV',
  current: 20,
  max: 20,
  color: 'ember',
  visibility: 'everyone',
  display: 'number',
};

function stateWith(image: unknown): unknown {
  return {
    type: 'state',
    token: { name: 'Lyra', image },
    bars: [hp],
    values: { forca: 16 },
    canEdit: true,
  };
}

describe('frame to host messages', () => {
  it('accepts bars.adjust naming the bar by its label', () =>
    expect(sheetFrameMessageDto.parse(adjust)).toEqual(adjust));
  it('accepts bars.adjust naming the bar by its id', () =>
    expect(sheetFrameMessageDto.parse({ ...adjust, bar: id })).toEqual({ ...adjust, bar: id }));
  it('accepts a bar reference of 64 characters and refuses 65 or an empty one', () => {
    expect(sheetFrameMessageDto.safeParse({ ...adjust, bar: 'b'.repeat(64) }).success).toBe(true);
    expect(sheetFrameMessageDto.safeParse({ ...adjust, bar: 'b'.repeat(65) }).success).toBe(false);
    expect(sheetFrameMessageDto.safeParse({ ...adjust, bar: '' }).success).toBe(false);
  });
  it('refuses the old barId field in bars.adjust', () =>
    expect(
      sheetFrameMessageDto.safeParse({
        type: 'bars.adjust',
        requestId: '1',
        barId: id,
        change: { op: 'add', amount: -5 },
      }).success,
    ).toBe(false));
  it('accepts dice.roll with an expression, a label and a visibility', () =>
    expect(
      sheetFrameMessageDto.parse({
        type: 'dice.roll',
        requestId: '2',
        expression: ' 1d20+5 ',
        label: 'Ataque',
        visibility: 'public',
      }),
    ).toEqual({
      type: 'dice.roll',
      requestId: '2',
      expression: '1d20+5',
      label: 'Ataque',
      visibility: 'public',
    }));
  it('rolls in public when the frame sends no visibility', () =>
    expect(
      sheetFrameMessageDto.parse({ type: 'dice.roll', requestId: '2', expression: '1d6' }),
    ).toEqual({ type: 'dice.roll', requestId: '2', expression: '1d6', visibility: 'public' }));
  it('accepts values.set and ready', () => {
    expect(
      sheetFrameMessageDto.parse({ type: 'values.set', requestId: '3', changes: { notas: null } }),
    ).toEqual({ type: 'values.set', requestId: '3', changes: { notas: null } });
    expect(sheetFrameMessageDto.parse({ type: 'ready', requestId: '0' })).toEqual({
      type: 'ready',
      requestId: '0',
    });
  });
  it.each(['chat.send', 'token.move', 'values.get'])('refuses the unknown type %s', (type) =>
    expect(sheetFrameMessageDto.safeParse({ ...adjust, type }).success).toBe(false),
  );
  it.each(['tokenId', 'campaignId', 'sheetId'])('refuses a frame message choosing %s', (field) =>
    expect(sheetFrameMessageDto.safeParse({ ...adjust, [field]: id }).success).toBe(false),
  );
  it('accepts a requestId of 64 characters and refuses 65 or none', () => {
    expect(sheetFrameMessageDto.safeParse({ ...adjust, requestId: 'r'.repeat(64) }).success).toBe(
      true,
    );
    expect(sheetFrameMessageDto.safeParse({ ...adjust, requestId: 'r'.repeat(65) }).success).toBe(
      false,
    );
    expect(sheetFrameMessageDto.safeParse({ type: 'ready' }).success).toBe(false);
  });
  it('refuses values.set with a forbidden key', () =>
    expect(
      sheetFrameMessageDto.safeParse({
        type: 'values.set',
        requestId: '3',
        changes: JSON.parse('{"__proto__":{"admin":true}}') as unknown,
      }).success,
    ).toBe(false));
});

const logLine = { type: 'console', level: 'error', message: 'x is not defined', at: [] };

describe('frame console lines', () => {
  it.each(['log', 'info', 'warn', 'error', 'debug'])(
    'accepts a %s line with no requestId',
    (level) =>
      expect(sheetFrameMessageDto.parse({ ...logLine, level })).toEqual({ ...logLine, level }),
  );
  it('refuses another level', () =>
    expect(sheetFrameMessageDto.safeParse({ ...logLine, level: 'trace' }).success).toBe(false));
  it('accepts a message at the limit and refuses one character more', () => {
    const at = 'm'.repeat(SHEET_CONSOLE_MESSAGE_MAX_LENGTH);
    expect(sheetFrameMessageDto.safeParse({ ...logLine, message: at }).success).toBe(true);
    expect(sheetFrameMessageDto.safeParse({ ...logLine, message: `${at}m` }).success).toBe(false);
  });
  it('takes srcdoc positions up to the limit, each a 1-based line and a column', () => {
    const position = { line: 12, column: 0 };
    const full = Array.from({ length: SHEET_CONSOLE_POSITIONS_MAX }, () => position);
    expect(sheetFrameMessageDto.safeParse({ ...logLine, at: full }).success).toBe(true);
    expect(sheetFrameMessageDto.safeParse({ ...logLine, at: [...full, position] }).success).toBe(
      false,
    );
    expect(
      sheetFrameMessageDto.safeParse({ ...logLine, at: [{ line: 0, column: 0 }] }).success,
    ).toBe(false);
    expect(
      sheetFrameMessageDto.safeParse({ ...logLine, at: [{ line: 1.5, column: 0 }] }).success,
    ).toBe(false);
  });
  it('refuses a line with a requestId or anything else the frame should not send', () => {
    expect(sheetFrameMessageDto.safeParse({ ...logLine, requestId: '1' }).success).toBe(false);
    expect(sheetFrameMessageDto.safeParse({ ...logLine, args: [{}] }).success).toBe(false);
  });
  it('accepts the count of dropped lines, at least one', () => {
    const dropped = { type: 'console.dropped', count: 30 };
    expect(sheetFrameMessageDto.parse(dropped)).toEqual(dropped);
    expect(sheetFrameMessageDto.safeParse({ ...dropped, count: 0 }).success).toBe(false);
  });
});

describe('host to frame messages', () => {
  it('accepts a state with the token image as an ArrayBuffer', () =>
    expect(
      sheetHostMessageDto.safeParse(stateWith({ type: 'image/webp', bytes: new ArrayBuffer(4) }))
        .success,
    ).toBe(true));
  it('accepts a state with no token and no bars (a sheet with no holder)', () =>
    expect(
      sheetHostMessageDto.safeParse({
        type: 'state',
        token: null,
        bars: [],
        values: {},
        canEdit: true,
      }).success,
    ).toBe(true));
  it('refuses a state without the token field', () =>
    expect(
      sheetHostMessageDto.safeParse({ type: 'state', bars: [], values: {}, canEdit: true }).success,
    ).toBe(false));
  it('refuses image bytes that are a view instead of an ArrayBuffer', () =>
    expect(
      sheetHostMessageDto.safeParse(stateWith({ type: 'image/webp', bytes: new Uint8Array(4) }))
        .success,
    ).toBe(false));
  it('refuses an SVG token image', () =>
    expect(
      sheetHostMessageDto.safeParse(stateWith({ type: 'image/svg+xml', bytes: new ArrayBuffer(4) }))
        .success,
    ).toBe(false));
  it('accepts an error without a requestId when the message could not be read', () =>
    expect(
      sheetHostMessageDto.parse({
        type: 'error',
        requestId: null,
        code: 'INVALID_MESSAGE',
        message: 'x',
      }),
    ).toEqual({ type: 'error', requestId: null, code: 'INVALID_MESSAGE', message: 'x' }));
  it('refuses an error code that is not UPPER_SNAKE', () =>
    expect(
      sheetHostMessageDto.safeParse({
        type: 'error',
        requestId: '1',
        code: 'rate limited',
        message: 'x',
      }).success,
    ).toBe(false));
});
