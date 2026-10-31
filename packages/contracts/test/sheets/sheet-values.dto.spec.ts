import { describe, expect, it } from 'vitest';
import {
  SHEET_VALUES_MAX_BYTES,
  sheetValuesDto,
  sheetValuesPatchDto,
  updateSheetValuesRequestDto,
} from '../../src';

const actionId = '00000000-0000-4000-8000-000000000001';

function nestedValues(depth: number): Record<string, unknown> {
  let value: unknown = 1;
  for (let level = 1; level < depth; level++) value = { nivel: value };
  return { raiz: value };
}

function flatValues(keys: number): Record<string, number> {
  return Object.fromEntries(Array.from({ length: keys }, (_, index) => [`k${index}`, index]));
}

function messageOf(input: unknown): string {
  const parsed = sheetValuesDto.safeParse(input);
  return parsed.success ? 'accepted' : (parsed.error.issues[0]?.message ?? '');
}

describe('sheet values patch', () => {
  it('accepts numbers, nested objects and null removals in one patch', () => {
    const changes = { forca: 16, pericias: { furtividade: true }, notas: null };
    expect(updateSheetValuesRequestDto.parse({ actionId, changes })).toEqual({
      actionId,
      changes: { forca: 16, pericias: { furtividade: true }, notas: null },
    });
  });
  it('returns a copy that does not follow later changes to the input', () => {
    const input = { pericias: { furtividade: true } };
    const parsed = sheetValuesDto.parse(input);
    input.pericias.furtividade = false;
    expect(parsed).toEqual({ pericias: { furtividade: true } });
  });
  it('refuses an empty patch', () => expect(sheetValuesPatchDto.safeParse({}).success).toBe(false));
  it('refuses a patch carrying an expectedVersion (the last write wins per key)', () =>
    expect(
      updateSheetValuesRequestDto.safeParse({ actionId, expectedVersion: 2, changes: { forca: 1 } })
        .success,
    ).toBe(false));
});

describe('sheet values budget', () => {
  it('accepts a key of 64 characters and refuses one of 65 citing it', () => {
    expect(messageOf({ ['a'.repeat(64)]: 1 })).toBe('accepted');
    expect(messageOf({ ['a'.repeat(65)]: 1 })).toContain(`"${'a'.repeat(65)}"`);
  });
  it('accepts values nested 8 levels deep and refuses 9', () => {
    expect(messageOf(nestedValues(8))).toBe('accepted');
    expect(messageOf(nestedValues(9))).toBe('Sheet value nested 9 levels deep; expected at most 8');
  });
  it('accepts 1000 keys and refuses 1001', () => {
    expect(messageOf(flatValues(1000))).toBe('accepted');
    expect(messageOf(flatValues(1001))).toBe(
      'Sheet values have more than 1000 keys; expected at most 1000',
    );
  });
  it('counts nested keys in the same 1000-key budget', () =>
    expect(messageOf({ pericias: flatValues(1000) })).toContain('more than 1000 keys'));
  it('accepts exactly 256 KiB of JSON and refuses one byte more', () => {
    // {"t":"…"} is the text plus 8 bytes of JSON.
    expect(messageOf({ t: 'x'.repeat(SHEET_VALUES_MAX_BYTES - 8) })).toBe('accepted');
    expect(messageOf({ t: 'x'.repeat(SHEET_VALUES_MAX_BYTES - 7) })).toBe(
      'Sheet values exceed 262144 bytes of JSON',
    );
  });
  it('counts multi-byte characters by their UTF-8 size', () =>
    expect(messageOf({ t: 'ç'.repeat(SHEET_VALUES_MAX_BYTES / 2) })).toContain('exceed'));
  it('refuses a huge array by the byte budget before walking it whole', () =>
    expect(messageOf({ lista: new Array<number>(300_000).fill(0) })).toBe(
      'Sheet values byte budget exceeded',
    ));
});

describe('sheet values refusals', () => {
  it.each(['__proto__', 'constructor', 'prototype', 'com espaço', 'força', ''])(
    'refuses the key %j citing it',
    (key) =>
      expect(messageOf(JSON.parse(`{${JSON.stringify(key)}:1}`))).toContain(JSON.stringify(key)),
  );
  it('refuses a forbidden key nested inside an object', () =>
    expect(messageOf(JSON.parse('{"pericias":{"__proto__":{"x":1}}}'))).toContain('"__proto__"'));
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'refuses the number %s',
    (value) => expect(messageOf({ forca: value })).toContain('expected a finite number'),
  );
  it.each([
    ['undefined', undefined],
    ['a function', () => 1],
    ['a date', new Date(0)],
  ])('refuses %s as a value', (_, value) =>
    expect(sheetValuesDto.safeParse({ campo: value }).success).toBe(false),
  );
  it('refuses an array or a string as the whole values', () => {
    expect(messageOf([1])).toBe('Expected sheet values to be an object of keys');
    expect(messageOf('forca')).toBe('Expected sheet values to be an object of keys');
  });
});
