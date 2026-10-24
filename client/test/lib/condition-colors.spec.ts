import { CONDITION_COLORS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  CONDITION_COLOR_ENTRIES,
  conditionColorNumberOf,
  conditionColorOf,
  paletteColorAt,
} from '@/lib/condition-colors';

// WCAG 2.x relative luminance and contrast ratio, written here so the palette is checked against
// the rule, not against the module's own idea of it.
function channelLuminance(byte: number): number {
  const value = byte / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminanceOf(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  if (r === undefined || g === undefined || b === undefined || !/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`expected a #rrggbb color, got ${hex}`);
  }
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastOf(foreground: string, background: string): number {
  const [light, dark] = [luminanceOf(foreground), luminanceOf(background)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const CARD = '#15181D';

describe('contrast helper of this spec', () => {
  it('black on white is 21:1 and a color on itself 1:1', () => {
    expect(contrastOf('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastOf(CARD, CARD)).toBeCloseTo(1, 5);
  });
});

describe('CONDITION_COLOR_ENTRIES', () => {
  it('has one entry per contract color key, no more', () => {
    expect(Object.keys(CONDITION_COLOR_ENTRIES).sort()).toEqual([...CONDITION_COLORS].sort());
  });

  it.each(CONDITION_COLORS)('%s reads at 4.5:1 or more on the card (#15181D)', (color) => {
    expect(contrastOf(CONDITION_COLOR_ENTRIES[color].hex, CARD)).toBeGreaterThanOrEqual(4.5);
  });

  it('each color has its own pt-BR name', () => {
    const labels = CONDITION_COLORS.map((color) => CONDITION_COLOR_ENTRIES[color].label);
    expect(new Set(labels).size).toBe(12);
    expect(CONDITION_COLOR_ENTRIES.ember.label).toBe('Brasa');
    expect(CONDITION_COLOR_ENTRIES.teal.label).toBe('Verde-água');
  });
});

describe('conditionColorOf', () => {
  it('without a color, a benefit is the gold of the tone (--primary)', () => {
    expect(conditionColorOf(null, 'benefit')).toBe('#c5a46d');
  });

  it.each(['harm', 'incapacitating'] as const)(
    'without a color, a %s condition is the destructive copper',
    (tone) => {
      expect(conditionColorOf(null, tone)).toBe('#b5654f');
    },
  );

  it.each(['benefit', 'harm', 'incapacitating'] as const)(
    'with ember, a %s condition is the palette hex whatever its tone',
    (tone) => {
      expect(conditionColorOf('ember', tone)).toBe('#ec7a45');
    },
  );
});

describe('conditionColorNumberOf', () => {
  it('is the palette hex as a number', () => {
    expect(conditionColorNumberOf('sky', 'harm')).toBe(0x5cbcee);
  });

  it('without a color is the tone hex as a number', () => {
    expect(conditionColorNumberOf(null, 'benefit')).toBe(0xc5a46d);
    expect(conditionColorNumberOf(null, 'incapacitating')).toBe(0xb5654f);
  });
});

describe('paletteColorAt', () => {
  it('writes the palette color as rgb channels with the alpha', () => {
    expect(paletteColorAt('ember', 0.6)).toBe('rgb(236 122 69 / 0.6)');
  });

  it('a full alpha keeps the same channels', () => {
    expect(paletteColorAt('sky', 1)).toBe('rgb(92 188 238 / 1)');
  });
});
