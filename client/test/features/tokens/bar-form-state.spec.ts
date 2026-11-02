import { MAX_BARS_PER_TOKEN } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  addBar,
  barDraftsOf,
  barFormsOf,
  barSampleOf,
  barSuggestionsOf,
  moveBar,
  type BarFormValues,
} from '@/features/tokens/bar-form-state';
import { BAR_PRESETS } from '@/features/tokens/token-messages';
import { lyra } from '../../support/table-session-fixtures';

function withMax(bar: BarFormValues | undefined, maxText: string): BarFormValues {
  if (!bar) throw new Error('no bar to type the maximum into');
  return { ...bar, maxText };
}

describe('addBar', () => {
  it('the first bar is the PV, ember, hidden, as numbers, with a max of 10 and no current yet', () => {
    expect(addBar([])[0]).toMatchObject({
      label: 'PV',
      color: 'ember',
      visibility: 'controllers',
      display: 'number',
      maxText: '10',
      tempText: '0',
      current: null,
    });
  });

  it('the second is "Barra 2", steel, seen by everyone', () => {
    expect(addBar(addBar([]))[1]).toMatchObject({
      label: 'Barra 2',
      color: 'steel',
      visibility: 'everyone',
    });
  });

  it('a preset gives its label, color and who sees it', () => {
    expect(addBar([], BAR_PRESETS.mana)[0]).toMatchObject({
      label: 'Mana',
      color: 'steel',
      visibility: 'everyone',
      maxText: '10',
    });
  });

  it(`with ${MAX_BARS_PER_TOKEN} bars nothing is added`, () => {
    let bars: readonly BarFormValues[] = [];
    for (let index = 0; index < MAX_BARS_PER_TOKEN; index += 1) bars = addBar(bars);
    expect(addBar(bars)).toBe(bars);
  });
});

describe('barSuggestionsOf', () => {
  it('without bars, PV, Mana and Escudo', () => {
    expect(barSuggestionsOf([]).map(({ label }) => label)).toEqual(['PV', 'Mana', 'Escudo']);
  });

  it('with a "pv" (any case), Mana, Escudo and Fôlego', () => {
    const bars = addBar([]).map((bar) => ({ ...bar, label: 'pv' }));
    expect(barSuggestionsOf(bars).map(({ label }) => label)).toEqual(['Mana', 'Escudo', 'Fôlego']);
  });

  it('with the four presets, none', () => {
    const bars = Object.values(BAR_PRESETS).reduce(
      (all: readonly BarFormValues[], preset) => addBar(all, preset),
      [],
    );
    expect(barSuggestionsOf(bars)).toEqual([]);
  });
});

describe('barDraftsOf', () => {
  it('a new bar with a max of "45" is born full: 45 / 45', () => {
    const drafts = barDraftsOf([withMax(addBar([])[0], '45')]);
    expect(drafts[0]).toMatchObject({ current: 45, max: 45 });
  });

  it('a bar of the token (12 / 38) with a max of "50" keeps its current: 12 / 50', () => {
    const [pv] = barFormsOf(lyra({ bars: [{ ...lyra().bars[0]!, current: 12, max: 38 }] }).bars);
    expect(barDraftsOf([withMax(pv, '50')])[0]).toMatchObject({ current: 12, max: 50 });
  });

  it.each(['0', '100000', '4,5', ''])('a max of "%s" is not a number the DTO takes', (typed) => {
    const [draft] = barDraftsOf([withMax(addBar([])[0], typed)]);
    expect(draft?.max).toBeNaN();
  });
});

describe('barFormsOf', () => {
  it('opens the bars of the token with their max as text and their current kept', () => {
    expect(
      barFormsOf(lyra().bars).map(({ label, current, maxText }) => [label, current, maxText]),
    ).toEqual([
      ['PV', 32, '45'],
      ['Inspiração', 1, '1'],
    ]);
  });
});

describe('barSampleOf', () => {
  it('a new bar with a max of "45" is drawn full, 45 / 45', () => {
    expect(barSampleOf(withMax(addBar([])[0], '45'))).toEqual({ current: 45, max: 45, temp: 0 });
  });

  it('a bar of the token keeps its current against the max typed', () => {
    const [pv] = barFormsOf(lyra().bars);
    expect(barSampleOf(withMax(pv, '60'))).toEqual({ current: 32, max: 60, temp: 0 });
  });

  it('an unreadable max draws nothing', () => {
    expect(barSampleOf(withMax(addBar([])[0], ''))).toBeNull();
  });
});

describe('moveBar', () => {
  it('swaps a bar with its neighbour, and does nothing past the ends', () => {
    const bars = addBar(addBar([]));
    const [first, second] = bars;
    expect(moveBar(bars, 1, -1)).toEqual([second, first]);
    expect(moveBar(bars, 0, -1)).toEqual(bars);
    expect(moveBar(bars, 1, 1)).toEqual(bars);
  });
});
