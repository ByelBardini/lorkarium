import { describe, expect, it } from 'vitest';
import {
  SHEET_VALUES_MAX_BYTES,
  applySheetValueEdits,
  sheetValuePathPatchesDto,
  sheetValuesDto,
  updateSheetValuesRequestDto,
} from '../../src';

const actionId = '00000000-0000-4000-8000-000000000001';

function patchMessageOf(input: unknown): string {
  const parsed = sheetValuePathPatchesDto.safeParse(input);
  return parsed.success ? 'accepted' : (parsed.error.issues[0]?.message ?? '');
}

function pathOf(length: number): string[] {
  return Array.from({ length }, (_, index) => `n${index}`);
}

describe('sheet value path patches', () => {
  it.each([1, 8])('accepts a path of %s keys', (length) =>
    expect(patchMessageOf([{ path: pathOf(length), value: 1 }])).toBe('accepted'),
  );

  it('refuses a path of 9 keys citing the length', () =>
    expect(patchMessageOf([{ path: pathOf(9), value: 1 }])).toBe(
      'Sheet value path has 9 keys; expected 1 to 8',
    ));

  it('refuses an empty path', () =>
    expect(patchMessageOf([{ path: [], value: 1 }])).toBe(
      'Sheet value path has 0 keys; expected 1 to 8',
    ));

  it.each([
    ['first', ['__proto__', 'efeito']],
    ['middle', ['hab', 'constructor', 'efeito']],
    ['last', ['hab', 'k3f9', 'prototype']],
  ])('refuses a forbidden key in the %s place citing it', (_place, path) => {
    const forbidden = path.find((key) => ['__proto__', 'constructor', 'prototype'].includes(key));
    expect(patchMessageOf([{ path, value: 1 }])).toContain(JSON.stringify(forbidden));
  });

  it('refuses a key with an accent citing it', () =>
    expect(patchMessageOf([{ path: ['força'], value: 1 }])).toContain('"força"'));

  it('accepts null as the removal of the path', () =>
    expect(sheetValuePathPatchesDto.parse([{ path: ['hab', 'k3f9'], value: null }])).toEqual([
      { path: ['hab', 'k3f9'], value: null },
    ]));

  it('refuses a value that would sit deeper than 8 levels', () =>
    expect(patchMessageOf([{ path: pathOf(7), value: { a: { b: 1 } } }])).toBe(
      'Sheet value nested 9 levels deep; expected at most 8',
    ));

  it('refuses a value that is not JSON', () =>
    expect(patchMessageOf([{ path: ['forca'], value: Number.NaN }])).toContain(
      'expected a finite number',
    ));

  it('refuses no patch at all', () =>
    expect(patchMessageOf([])).toBe('patches is empty; expected 1 to 100 path patches'));

  it('refuses 101 patches', () =>
    expect(patchMessageOf(Array.from({ length: 101 }, () => ({ path: ['forca'], value: 1 })))).toBe(
      'Sheet value patches are 101; expected 1 to 100',
    ));

  it('refuses a patch with a field besides path and value', () =>
    expect(sheetValuePathPatchesDto.safeParse([{ path: ['a'], value: 1, op: 'set' }]).success).toBe(
      false,
    ));
});

describe('sheet values request with path patches', () => {
  it('accepts patches without root changes', () =>
    expect(
      updateSheetValuesRequestDto.parse({ actionId, patches: [{ path: ['hab', 'a'], value: 2 }] }),
    ).toEqual({ actionId, patches: [{ path: ['hab', 'a'], value: 2 }] }));

  it('accepts root changes and patches together', () =>
    expect(
      updateSheetValuesRequestDto.parse({
        actionId,
        changes: { forca: 16 },
        patches: [{ path: ['hab', 'a'], value: 2 }],
      }),
    ).toEqual({ actionId, changes: { forca: 16 }, patches: [{ path: ['hab', 'a'], value: 2 }] }));

  it('refuses a request with neither changes nor patches', () => {
    const parsed = updateSheetValuesRequestDto.safeParse({ actionId });
    expect(parsed.success ? 'accepted' : parsed.error.issues[0]?.message).toBe(
      'changes and patches are both absent; expected at least one of them',
    );
  });
});

describe('applySheetValueEdits', () => {
  const values = {
    forca: 16,
    hab: { k3f9: { efeito: 'Cura', custo: 2 }, p2a1: { efeito: 'Raio' } },
  };

  it('a path patch changes only that leaf and keeps the rest of the tree', () =>
    expect(
      applySheetValueEdits(values, {
        patches: [{ path: ['hab', 'k3f9', 'efeito'], value: 'Luz' }],
      }),
    ).toEqual({ forca: 16, hab: { k3f9: { efeito: 'Luz', custo: 2 }, p2a1: { efeito: 'Raio' } } }));

  it('two patches on different abilities both stay', () =>
    expect(
      applySheetValueEdits(values, {
        patches: [
          { path: ['hab', 'k3f9', 'custo'], value: 3 },
          { path: ['hab', 'p2a1', 'custo'], value: 1 },
        ],
      }).hab,
    ).toEqual({ k3f9: { efeito: 'Cura', custo: 3 }, p2a1: { efeito: 'Raio', custo: 1 } }));

  it('missing objects along the path are created', () =>
    expect(applySheetValueEdits({}, { patches: [{ path: ['a', 'b', 'c'], value: true }] })).toEqual(
      { a: { b: { c: true } } },
    ));

  it('a path over a number turns the number into an object', () =>
    expect(
      applySheetValueEdits(values, { patches: [{ path: ['forca', 'base'], value: 2 }] }),
    ).toEqual({ ...values, forca: { base: 2 } }));

  it('a path over an array turns the array into an object', () =>
    expect(
      applySheetValueEdits({ lista: [1, 2] }, { patches: [{ path: ['lista', '0'], value: 9 }] }),
    ).toEqual({ lista: { '0': 9 } }));

  it('null removes the leaf and keeps its siblings', () =>
    expect(
      applySheetValueEdits(values, { patches: [{ path: ['hab', 'k3f9'], value: null }] }).hab,
    ).toEqual({ p2a1: { efeito: 'Raio' } }));

  it('null on a path that is not there changes nothing', () =>
    expect(
      applySheetValueEdits(values, { patches: [{ path: ['forca', 'base', 'x'], value: null }] }),
    ).toEqual(values));

  it('root changes apply first, then the patches in order', () =>
    expect(
      applySheetValueEdits(values, {
        changes: { hab: { novo: { efeito: 'Eco' } }, forca: null },
        patches: [
          { path: ['hab', 'novo', 'custo'], value: 1 },
          { path: ['hab', 'novo', 'custo'], value: 4 },
        ],
      }),
    ).toEqual({ hab: { novo: { efeito: 'Eco', custo: 4 } } }));

  it('leaves the values it was given untouched', () => {
    const before = JSON.stringify(values);
    applySheetValueEdits(values, { patches: [{ path: ['hab', 'k3f9', 'efeito'], value: 'Luz' }] });
    expect(JSON.stringify(values)).toBe(before);
  });

  it('a merge past 256 KiB comes out whole and the stored-values DTO refuses it', () => {
    const big = { t: 'x'.repeat(SHEET_VALUES_MAX_BYTES - 8) };
    const merged = applySheetValueEdits(big, { patches: [{ path: ['u'], value: 1 }] });
    expect(sheetValuesDto.safeParse(merged).success).toBe(false);
  });
});
