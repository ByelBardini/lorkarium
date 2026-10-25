import { describe, expect, it } from 'vitest';
import { conditionStripOf } from '@/renderer/condition-strip';
import type { ConditionMarkView } from '@/renderer/token-view';

const ONE_CELL = { width: 64, height: 64 };
const EMBER_POISON: ConditionMarkView = {
  icon: 'flask-conical',
  tone: 'harm',
  color: 'ember',
  remainingRounds: 2,
  stacks: null,
  imageUrl: null,
};
const PLAIN_BLESS: ConditionMarkView = {
  icon: 'sparkles',
  tone: 'benefit',
  color: null,
  remainingRounds: null,
  stacks: null,
  imageUrl: null,
};

describe('conditionStripOf colors', () => {
  it('from afar (zoom 0.5) each dot carries its color, null when painted by its nature', () => {
    const strip = conditionStripOf({
      ...ONE_CELL,
      conditions: [EMBER_POISON, PLAIN_BLESS],
      zoom: 0.5,
    });
    expect(strip.band === 'dots' && strip.dots.map(({ tone, color }) => [tone, color])).toEqual([
      ['harm', 'ember'],
      ['benefit', null],
    ]);
  });

  it.each([1, 2])('at zoom %s each icon carries its color', (zoom) => {
    const strip = conditionStripOf({ ...ONE_CELL, conditions: [EMBER_POISON, PLAIN_BLESS], zoom });
    const icons = strip.band === 'icons' || strip.band === 'detailed' ? strip.icons : [];
    expect(icons.map(({ color }) => color)).toEqual(['ember', null]);
  });
});
