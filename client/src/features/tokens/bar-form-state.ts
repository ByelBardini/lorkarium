import {
  MAX_BARS_PER_TOKEN,
  type BarColorDto,
  type BarDisplayDto,
  type BarVisibilityDto,
  type TokenBarDto,
} from '@lorkarium/contracts';
import { parseBarMax, parseBarTemp } from '@/lib/bar-input';
import { BAR_PRESETS, type BarPreset } from './token-messages';

/** One bar as set up in the dialog. The max and the temp are typed (`maxText`, `tempText`); the current is adjusted on the
 *  card, so it travels as the token has it, and a new bar (`current: null`) is born full. `key`
 *  keeps React rows stable. */
export type BarFormValues = Readonly<{
  key: string;
  label: string;
  maxText: string;
  tempText: string;
  current: number | null;
  color: BarColorDto;
  visibility: BarVisibilityDto;
  display: BarDisplayDto;
}>;

export type BarFormErrors = Partial<Record<'label' | 'max' | 'temp', string>>;

/** A bar ready for the DTO: an unreadable max or temp is `NaN`, which the DTO refuses on it. */
export type BarDraft = Readonly<{
  label: string;
  current: number;
  max: number;
  temp: number;
  color: BarColorDto;
  visibility: BarVisibilityDto;
  display: BarDisplayDto;
}>;

const NEW_BAR_MAX = '10';
const NEW_BAR_TEMP = '0';
const SUGGESTIONS_SHOWN = 3;
const OTHER_BAR: Omit<BarPreset, 'label'> = { color: 'steel', visibility: 'everyone' };

let barKeys = 0;

/** A new bar at the end, from a preset or, by "Nova barra", the PV first and "Barra N" after.
 *  Past `MAX_BARS_PER_TOKEN`, the same list.
 *
 *  Example: `addBar(form.bars, BAR_PRESETS.mana)` */
export function addBar(
  bars: readonly BarFormValues[],
  preset?: BarPreset,
): readonly BarFormValues[] {
  if (bars.length >= MAX_BARS_PER_TOKEN) return bars;
  const look = preset ?? (bars.length === 0 ? BAR_PRESETS.pv : nextOtherBar(bars.length));
  const bar: BarFormValues = {
    key: nextBarKey(),
    ...look,
    maxText: NEW_BAR_MAX,
    tempText: NEW_BAR_TEMP,
    current: null,
    display: 'number',
  };
  return [...bars, bar];
}

function nextOtherBar(count: number): BarPreset {
  return { ...OTHER_BAR, label: `Barra ${count + 1}` };
}

/** The first three suggestions the token does not have yet (by label, any case).
 *
 *  Example: `barSuggestionsOf([]).map(({ label }) => label) // ['PV', 'Mana', 'Escudo']` */
export function barSuggestionsOf(bars: readonly BarFormValues[]): readonly BarPreset[] {
  const taken = new Set(bars.map(({ label }) => label.trim().toLocaleLowerCase('pt-BR')));
  return Object.values(BAR_PRESETS)
    .filter(({ label }) => !taken.has(label.toLocaleLowerCase('pt-BR')))
    .slice(0, SUGGESTIONS_SHOWN);
}

/** Swaps bar `index` with its neighbour (`-1` up, `1` down); the first one is drawn on the token. */
export function moveBar(
  bars: readonly BarFormValues[],
  index: number,
  offset: -1 | 1,
): readonly BarFormValues[] {
  const moving = bars[index];
  const other = bars[index + offset];
  if (!moving || !other) return bars;
  const moved = [...bars];
  moved[index] = other;
  moved[index + offset] = moving;
  return moved;
}

/** The bars of a token as the dialog opens them: their max and temp as text, their current kept.
 *
 *  Example: `barFormsOf(token.bars)` */
export function barFormsOf(bars: readonly TokenBarDto[]): readonly BarFormValues[] {
  return bars.map(({ label, current, max, temp, color, visibility, display }) => ({
    key: nextBarKey(),
    label,
    maxText: String(max),
    tempText: String(temp),
    current,
    color,
    visibility,
    display,
  }));
}

/** The bars to send: the max read as typed and a new bar full at it ("45" → 45 / 45).
 *
 *  Example: `barDraftsOf(form.bars)` */
export function barDraftsOf(bars: readonly BarFormValues[]): readonly BarDraft[] {
  return bars.map(({ label, maxText, tempText, current, color, visibility, display }) => {
    const max = parseBarMax(maxText) ?? Number.NaN;
    const temp = parseBarTemp(tempText) ?? Number.NaN;
    return { label, current: current ?? max, max, temp, color, visibility, display };
  });
}

/** What the sample and the preview draw, or `null` while the max cannot be read.
 *
 *  Example: `barSampleOf(bar) // { current: 45, max: 45, temp: 0 }` */
export function barSampleOf(
  bar: BarFormValues,
): Readonly<{ current: number; max: number; temp: number }> | null {
  const max = parseBarMax(bar.maxText);
  if (max === null) return null;
  return { current: bar.current ?? max, max, temp: parseBarTemp(bar.tempText) ?? 0 };
}

function nextBarKey(): string {
  barKeys += 1;
  return `bar-${barKeys}`;
}
