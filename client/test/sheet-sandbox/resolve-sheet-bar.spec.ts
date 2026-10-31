import { describe, expect, it } from 'vitest';
import { resolveSheetBar, sheetBarLabelKey } from '@/sheet-sandbox/resolve-sheet-bar';

const PV = { id: 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b', label: 'PV' };
const INSPIRATION = { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', label: 'Inspiração' };
const BARS = [PV, INSPIRATION];

describe('sheetBarLabelKey', () => {
  it('drops case, accents and edge spaces', () =>
    expect(sheetBarLabelKey('  Pontos de AÇÃO ')).toBe('pontos de acao'));
});

describe('resolveSheetBar', () => {
  it('finds a bar by its exact id', () =>
    expect(resolveSheetBar(BARS, INSPIRATION.id)).toEqual({ ok: true, barId: INSPIRATION.id }));

  it('finds a bar by its label, with no case, accents or edge spaces', () => {
    expect(resolveSheetBar(BARS, 'pv')).toEqual({ ok: true, barId: PV.id });
    expect(resolveSheetBar(BARS, ' INSPIRACAO ')).toEqual({ ok: true, barId: INSPIRATION.id });
  });

  it('prefers the exact id over a bar whose label is that text', () => {
    const tricky = { id: 'x-bar', label: PV.id };
    expect(resolveSheetBar([tricky, PV], PV.id)).toEqual({ ok: true, barId: PV.id });
  });

  it('two bars with the label are BAR_AMBIGUOUS, citing the name and how many', () => {
    const second = { id: 'c3d4e5f6-0000-4000-8000-000000000003', label: 'pv' };
    expect(resolveSheetBar([PV, second], 'PV')).toEqual({
      ok: false,
      code: 'BAR_AMBIGUOUS',
      message: `bar "PV" matches 2 bars; expected one: use the bar's id`,
    });
  });

  it('no match is BAR_NOT_FOUND, listing the labels there are', () =>
    expect(resolveSheetBar(BARS, 'Mana')).toEqual({
      ok: false,
      code: 'BAR_NOT_FOUND',
      message: 'bar "Mana" not found; expected the id or the label of one of: "PV", "Inspiração"',
    }));

  it('a token with no bars is BAR_NOT_FOUND', () =>
    expect(resolveSheetBar([], 'PV')).toMatchObject({ ok: false, code: 'BAR_NOT_FOUND' }));

  it('a sheet with no token is NO_TOKEN', () =>
    expect(resolveSheetBar(null, 'PV')).toMatchObject({ ok: false, code: 'NO_TOKEN' }));
});
