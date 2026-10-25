import type { ConditionColorDto, ConditionToneDto } from '@lorkarium/contracts';
import { Container, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { PixiConditionMarks } from '@/renderer/pixi-condition-marks';
import type { ConditionMarkView } from '@/renderer/token-view';
import { goblinView } from '../support/token-view-fixtures';

const EMBER = 0xec7a45;
const SKY = 0x5cbcee;
const COPPER = 0xb5654f;
const BADGE = 0x1b1f25;
const ICONS_ZOOM = 1;
const DOTS_ZOOM = 0.5;

function mark(tone: ConditionToneDto, color: ConditionColorDto | null): ConditionMarkView {
  return { icon: 'skull', tone, color, remainingRounds: null, stacks: null, imageUrl: null };
}

function drawn(marks: ConditionMarkView[], zoom: number): PixiConditionMarks {
  const strip = new PixiConditionMarks();
  strip.draw(goblinView({ conditions: marks }), zoom);
  return strip;
}

function graphicsOf(container: Container): Graphics[] {
  return container.children.flatMap((child) =>
    child instanceof Graphics ? [child] : graphicsOf(child as Container),
  );
}

// The colors a Graphics paints with, read from its context the way PixiJS keeps them.
function paintedColors(graphics: Graphics, action: 'fill' | 'stroke'): number[] {
  return graphics.context.instructions
    .filter((instruction) => instruction.action === action)
    .map((instruction) => (instruction.data as { style: { color: number } }).style.color);
}

// A badge is its disc then its glyph (the first two Graphics of the strip).
function badgeOf(strip: PixiConditionMarks): { disc: Graphics; glyph: Graphics } {
  const [disc, glyph] = graphicsOf(strip.container);
  if (!disc || !glyph) throw new Error('expected a badge with a disc and a glyph');
  return { disc, glyph };
}

describe('PixiConditionMarks colors', () => {
  it('a harm condition in ember rings its badge and draws its glyph in ember', () => {
    const { disc, glyph } = badgeOf(drawn([mark('harm', 'ember')], ICONS_ZOOM));
    expect(paintedColors(disc, 'stroke')).toEqual([EMBER]);
    expect(paintedColors(glyph, 'stroke')).toContain(EMBER);
  });

  it('a harm condition without a color keeps the copper of its tone', () => {
    const { disc, glyph } = badgeOf(drawn([mark('harm', null)], ICONS_ZOOM));
    expect(paintedColors(disc, 'stroke')).toEqual([COPPER]);
    expect(paintedColors(glyph, 'stroke')).toContain(COPPER);
  });

  it('an incapacitating condition in sky is a disc filled in sky with a dark glyph', () => {
    const { disc, glyph } = badgeOf(drawn([mark('incapacitating', 'sky')], ICONS_ZOOM));
    expect(paintedColors(disc, 'fill')).toEqual([SKY]);
    expect(paintedColors(glyph, 'stroke')).toContain(BADGE);
    expect(paintedColors(glyph, 'stroke')).not.toContain(SKY);
  });

  it('from afar each dot is filled in its color, or its tone without one', () => {
    const strip = drawn([mark('harm', 'sky'), mark('harm', null)], DOTS_ZOOM);
    const dots = graphicsOf(strip.container).map((dot) => paintedColors(dot, 'fill'));
    expect(dots).toEqual([[SKY], [COPPER]]);
  });

  it('a change of color alone redraws the badges in the new color', () => {
    const strip = drawn([mark('harm', 'ember')], ICONS_ZOOM);
    const [before] = strip.container.children;
    strip.draw(goblinView({ conditions: [mark('harm', 'sky')] }), ICONS_ZOOM);
    expect(strip.container.children[0]).not.toBe(before);
    expect(paintedColors(badgeOf(strip).disc, 'stroke')).toEqual([SKY]);
  });

  it('a change of color alone on the dots redraws them', () => {
    const strip = drawn([mark('harm', 'ember')], DOTS_ZOOM);
    strip.draw(goblinView({ conditions: [mark('harm', 'sky')] }), DOTS_ZOOM);
    expect(graphicsOf(strip.container).map((dot) => paintedColors(dot, 'fill'))).toEqual([[SKY]]);
  });

  it('the same color drawn again keeps the badges drawn', () => {
    const strip = drawn([mark('harm', 'ember')], ICONS_ZOOM);
    const [before] = strip.container.children;
    strip.draw(goblinView({ conditions: [mark('harm', 'ember')] }), ICONS_ZOOM);
    expect(strip.container.children[0]).toBe(before);
  });
});
