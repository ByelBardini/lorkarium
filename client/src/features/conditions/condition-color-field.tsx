import {
  CONDITION_COLORS,
  isHexColor,
  type ConditionColorDto,
  type ConditionToneDto,
  type HexColorDto,
} from '@lorkarium/contracts';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId } from 'react';
import { CustomColorTile } from '@/components/color-picker/custom-color-tile';
import { CONDITION_COLOR_ENTRIES, conditionColorOf } from '@/lib/condition-colors';
import { cn } from '@/lib/utils';

// Radix values are strings: the tone's swatch needs one no palette key takes.
const BY_TONE = 'tone';
const BY_TONE_LABEL = 'Pela natureza';
// A custom color checks no swatch: Radix reads an empty value as nothing checked.
const NO_SWATCH = '';
// `--card` in client/src/index.css, where a condition's mark and tag are read.
const CARD_COLOR: HexColorDto = '#15181d';

type ColorSwatch = Readonly<{ value: string; label: string; style: React.CSSProperties }>;

/** "Cor" of a condition: round swatches (the radio is the one round shape the design system
 *  keeps), "Pela natureza" first — the tone's color, dashed so it reads as "not a pick" — then the
 *  palette and the custom color tile, which warns about a color that reads badly on the card
 *  without refusing it. Arrows move the pick among the swatches; the chosen one is also named in
 *  text, never by color alone.
 *
 *  Example: `<ConditionColorField value={color} tone={tone} onChange={setColor} />` */
export function ConditionColorField({
  value,
  tone,
  onChange,
}: Readonly<{
  value: ConditionColorDto | null;
  tone: ConditionToneDto;
  onChange: (color: ConditionColorDto | null) => void;
}>): React.JSX.Element {
  const legendId = useId();
  return (
    <fieldset className="min-w-0">
      <legend id={legendId} className="mb-2 text-[13px] text-label">
        Cor{' '}
        <span aria-hidden="true" className="text-muted-foreground">
          · {chosenLabelOf(value)}
        </span>
      </legend>
      <RadioGroupPrimitive.Root
        aria-labelledby={legendId}
        value={swatchValueOf(value)}
        orientation="horizontal"
        onValueChange={(next) => onChange(colorOfValue(next))}
        className="flex flex-wrap justify-center gap-2.5 p-0.5"
      >
        {swatchesOf(tone).map((swatch) => (
          <SwatchItem key={swatch.value} swatch={swatch} />
        ))}
        <CustomColorTile
          value={value}
          onPick={onChange}
          legibleOn={CARD_COLOR}
          className="size-6 ring-offset-background"
        />
      </RadioGroupPrimitive.Root>
    </fieldset>
  );
}

function SwatchItem({ swatch }: Readonly<{ swatch: ColorSwatch }>): React.JSX.Element {
  return (
    <RadioGroupPrimitive.Item
      value={swatch.value}
      aria-label={`Cor: ${swatch.label}`}
      title={swatch.label}
      style={swatch.style}
      className={cn(
        'size-6 shrink-0 rounded-full outline-none',
        'ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring/50',
        'data-[state=checked]:ring-2 data-[state=checked]:ring-ring',
      )}
    />
  );
}

function swatchesOf(tone: ConditionToneDto): ColorSwatch[] {
  const toneHex = conditionColorOf(null, tone);
  const byTone: ColorSwatch = {
    value: BY_TONE,
    label: BY_TONE_LABEL,
    style: { border: `1.5px dashed ${toneHex}`, backgroundColor: `${toneHex}40` },
  };
  const palette = CONDITION_COLORS.map((color) => ({
    value: color,
    label: CONDITION_COLOR_ENTRIES[color].label,
    style: { backgroundColor: CONDITION_COLOR_ENTRIES[color].hex },
  }));
  return [byTone, ...palette];
}

function swatchValueOf(value: ConditionColorDto | null): string {
  if (value === null) return BY_TONE;
  return isHexColor(value) ? NO_SWATCH : value;
}

function colorOfValue(value: string): ConditionColorDto | null {
  return CONDITION_COLORS.find((color) => color === value) ?? null;
}

function chosenLabelOf(value: ConditionColorDto | null): string {
  if (value === null) return BY_TONE_LABEL;
  return isHexColor(value) ? value : CONDITION_COLOR_ENTRIES[value].label;
}
