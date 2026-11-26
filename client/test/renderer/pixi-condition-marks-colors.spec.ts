import type { ConditionColorDto, ConditionToneDto } from '@lorkarium/contracts';
import { Container, Graphics, Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { conditionIconUrlOf } from '@/lib/condition-icons';
import { PixiConditionMarks } from '@/renderer/pixi-condition-marks';
import type { ConditionMarkView } from '@/renderer/token-view';
import { TokenTexturesFake } from '../support/token-textures-fake';
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
  // The skull already loaded, so every badge carries its glyph.
  const textures = new TokenTexturesFake();
  textures.arrive(conditionIconUrlOf('skull'));
  const strip = new PixiConditionMarks(textures);
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

// A badge is its disc (the first Graphics of the strip) and its glyph, the tinted icon.
function badgeOf(strip: PixiConditionMarks): { disc: Graphics; glyph: Sprite } {
  const [disc] = graphicsOf(strip.container);
  const glyph = (strip.container.children[0] as Container | undefined)?.children.find(
    (child): child is Sprite => child instanceof Sprite,
  );
  if (!disc || !glyph) throw new Error('expected a badge with a disc and a glyph');
  return { disc, glyph };
}

describe('PixiConditionMarks colors', () => {
  it('a harm condition in ember rings its badge and tints its glyph ember', () => {
    const { disc, glyph } = badgeOf(drawn([mark('harm', 'ember')], ICONS_ZOOM));
    expect(paintedColors(disc, 'stroke')).toEqual([EMBER]);
    expect(glyph.tint).toBe(EMBER);
  });

  it('a custom color rings the badge and draws the glyph in it', () => {
    const { disc, glyph } = badgeOf(drawn([mark('harm', '#336699')], ICONS_ZOOM));
    expect(paintedColors(disc, 'stroke')).toEqual([0x336699]);
    expect(glyph.tint).toBe(0x336699);
  });

  it('changing one custom color for a close one redraws the badges', () => {
    const strip = drawn([mark('harm', '#336699')], ICONS_ZOOM);
    strip.draw(goblinView({ conditions: [mark('harm', '#336698')] }), ICONS_ZOOM);
    expect(paintedColors(badgeOf(strip).disc, 'stroke')).toEqual([0x336698]);
  });

  it('a harm condition without a color keeps the copper of its tone', () => {
    const { disc, glyph } = badgeOf(drawn([mark('harm', null)], ICONS_ZOOM));
    expect(paintedColors(disc, 'stroke')).toEqual([COPPER]);
    expect(glyph.tint).toBe(COPPER);
  });

  it('an incapacitating condition in sky is a disc filled in sky with a dark glyph', () => {
    const { disc, glyph } = badgeOf(drawn([mark('incapacitating', 'sky')], ICONS_ZOOM));
    expect(paintedColors(disc, 'fill')).toEqual([SKY]);
    expect(glyph.tint).toBe(BADGE);
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
