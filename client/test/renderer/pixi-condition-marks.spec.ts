import { CONDITION_ICONS } from '@lorkarium/contracts';
import { Container, GraphicsContext, Text } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { conditionIconSvg } from '@/lib/condition-icons';
import { PixiConditionMarks } from '@/renderer/pixi-condition-marks';
import type { ConditionMarkView } from '@/renderer/token-view';
import { goblinView } from '../support/token-view-fixtures';

describe('condition icons on the canvas', () => {
  it.each(CONDITION_ICONS)('PixiJS parses the %s markup into something with size', (icon) => {
    const context = new GraphicsContext().svg(conditionIconSvg(icon, '#b5654f'));
    expect(context.bounds.width).toBeGreaterThan(4);
    expect(context.bounds.height).toBeGreaterThan(4);
  });
});

describe('PixiConditionMarks stacks', () => {
  // No rounds left to write, so the only label a badge can carry is its stacks.
  const endless = (stacks: number | null): ConditionMarkView => ({
    icon: 'skull',
    tone: 'harm',
    color: null,
    remainingRounds: null,
    stacks,
  });
  const DETAILED_ZOOM = 2;

  function labelsOf(container: Container): Text[] {
    return container.children.flatMap((child) =>
      child instanceof Text ? [child] : labelsOf(child as Container),
    );
  }

  function drawn(stacks: number | null, zoom = DETAILED_ZOOM): PixiConditionMarks {
    const marks = new PixiConditionMarks();
    marks.draw(goblinView({ conditions: [endless(stacks)] }), zoom);
    return marks;
  }

  it('up close a stacking condition writes its stacks at the top left of the badge', () => {
    const [label] = labelsOf(drawn(3).container);
    expect(label?.text).toBe('3');
    expect(label && [label.position.x < 0, label.position.y < 0]).toEqual([true, true]);
  });

  it('up close a non-stacking condition writes no stacks', () => {
    expect(labelsOf(drawn(null).container)).toEqual([]);
  });

  it('with plain icons (zoom 1) the stacks are not written', () => {
    expect(labelsOf(drawn(3, 1).container)).toEqual([]);
  });

  it('a change of stacks alone redraws the strip with the new count', () => {
    const marks = drawn(3);
    const [before] = marks.container.children;
    marks.draw(goblinView({ conditions: [endless(4)] }), DETAILED_ZOOM);
    expect(marks.container.children[0]).not.toBe(before);
    expect(labelsOf(marks.container).map(({ text }) => text)).toEqual(['4']);
  });

  it('the same stacks drawn again keep the badges drawn', () => {
    const marks = drawn(3);
    const [before] = marks.container.children;
    marks.draw(goblinView({ conditions: [endless(3)] }), DETAILED_ZOOM);
    expect(marks.container.children[0]).toBe(before);
  });
});
