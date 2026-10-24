import { describe, expect, it } from 'vitest';
import { shownStacksOf, stacksText } from '@/lib/condition-stacks';

describe('shownStacksOf', () => {
  it('a condition that does not stack shows no count', () => {
    expect(shownStacksOf({ maxStacks: null, stacks: 1 })).toBeNull();
  });

  it('a stacking condition shows its stacks', () => {
    expect(shownStacksOf({ maxStacks: 5, stacks: 3 })).toBe(3);
  });

  it('a stacking condition with a single stack still shows 1', () => {
    expect(shownStacksOf({ maxStacks: 5, stacks: 1 })).toBe(1);
  });
});

describe('stacksText', () => {
  it.each([
    [1, '1 stack'],
    [3, '3 stacks'],
  ])('%s stacks read "%s"', (stacks, text) => {
    expect(stacksText(stacks)).toBe(text);
  });
});
