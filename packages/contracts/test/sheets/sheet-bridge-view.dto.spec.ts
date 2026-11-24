import { describe, expect, it } from 'vitest';
import { SHEET_VIEW_MAX_BYTES, sheetFrameMessageDto, sheetHostMessageDto } from '../../src';

const viewSet = (value: unknown) => ({ type: 'view.set', requestId: '7', value });

function issuesOf(input: unknown): string {
  const parsed = sheetFrameMessageDto.safeParse(input);
  return parsed.success ? '' : parsed.error.issues.map((issue) => issue.message).join('; ');
}

// A JSON string of exactly `bytes` bytes: the two quotes count.
function textOfBytes(bytes: number): string {
  return 'a'.repeat(bytes - 2);
}

function stateWith(view: unknown): Record<string, unknown> {
  return {
    type: 'state',
    token: null,
    bars: [],
    values: {},
    canEdit: false,
    character: null,
    view,
  };
}

describe('view.set', () => {
  it('the cap is 4096 bytes of JSON', () => expect(SHEET_VIEW_MAX_BYTES).toBe(4096));

  it('accepts the tab and the scroll of who looks, as a fresh copy', () => {
    const value = { aba: 'origem', rolagem: 120 };
    const parsed = sheetFrameMessageDto.parse(viewSet(value));
    expect(parsed).toEqual({ type: 'view.set', requestId: '7', value });
    expect(parsed.type === 'view.set' && parsed.value).not.toBe(value);
  });

  it.each([
    ['a string', 'origem'],
    ['a number', 3],
    ['an array', ['a', 1]],
    ['null', null],
  ])('accepts %s as the view (null clears it)', (_name, value) =>
    expect(sheetFrameMessageDto.parse(viewSet(value))).toEqual(viewSet(value)),
  );

  it('accepts a view of exactly 4096 bytes of JSON', () =>
    expect(issuesOf(viewSet(textOfBytes(4096)))).toBe(''));

  it('refuses a view of 4097 bytes, citing its size and the cap', () =>
    expect(issuesOf(viewSet(textOfBytes(4097)))).toBe(
      'view has 4097 bytes of JSON; expected at most 4096',
    ));

  it('counts the bytes in UTF-8: 2048 "ç" are 4098 bytes with the quotes, past the cap', () =>
    expect(issuesOf(viewSet('ç'.repeat(2048)))).toContain('view has 4098 bytes'));

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a date', new Date(0)],
    ['a function', () => 1],
  ])('refuses %s: not JSON', (_name, value) =>
    expect(issuesOf(viewSet({ rolagem: value }))).not.toBe(''),
  );

  it('refuses a missing value', () =>
    expect(issuesOf({ type: 'view.set', requestId: '7' })).not.toBe(''));

  it('refuses a forbidden key, as the values do', () =>
    expect(issuesOf(viewSet(JSON.parse('{"__proto__":1}')))).toContain('"__proto__"'));

  it('refuses a sheet id: the host knows which sheet the frame is', () =>
    expect(sheetFrameMessageDto.safeParse({ ...viewSet(1), sheetId: 'x' }).success).toBe(false));
});

describe('state.view', () => {
  it('carries the view kept for who looks', () =>
    expect(sheetHostMessageDto.parse(stateWith({ aba: 'origem' }))).toEqual(
      stateWith({ aba: 'origem' }),
    ));

  it('is null when nothing is kept', () =>
    expect(sheetHostMessageDto.safeParse(stateWith(null)).success).toBe(true));

  it('a state without the view field is refused: it is required', () => {
    const withoutView = stateWith(null);
    Reflect.deleteProperty(withoutView, 'view');
    expect(sheetHostMessageDto.safeParse(withoutView).success).toBe(false);
  });

  it('refuses a view past the cap', () =>
    expect(sheetHostMessageDto.safeParse(stateWith(textOfBytes(4097))).success).toBe(false));
});
