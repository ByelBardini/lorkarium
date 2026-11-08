import { describe, expect, it } from 'vitest';
import { ContextLossBudget } from '@/lib/context-loss-budget';

const SECOND = 1000;

function budgetAt(
  times: readonly number[],
): Readonly<{ budget: ContextLossBudget; next: () => void }> {
  const queue = [...times];
  let now = 0;
  const budget = new ContextLossBudget(() => now);
  return { budget, next: () => void (now = (queue.shift() ?? now) * SECOND) };
}

function lossesAt(times: readonly number[]): string[] {
  const { budget, next } = budgetAt(times);
  return times.map(() => {
    next();
    return budget.recordLoss();
  });
}

describe('ContextLossBudget', () => {
  it('remounts after losses at 0 s and 30 s', () => {
    expect(lossesAt([0, 30])).toEqual(['remount', 'remount']);
  });

  it('gives up on the third loss within 60 s (0, 20 and 40 s)', () => {
    expect(lossesAt([0, 20, 40])).toEqual(['remount', 'remount', 'give-up']);
  });

  it('remounts on the third loss once the first left the 60 s window (0, 20 and 61 s)', () => {
    expect(lossesAt([0, 20, 61])).toEqual(['remount', 'remount', 'remount']);
  });

  it('after giving up, reset empties the budget and the next loss remounts again', () => {
    const { budget, next } = budgetAt([0, 20, 40, 41]);
    for (let loss = 0; loss < 3; loss += 1) {
      next();
      budget.recordLoss();
    }
    budget.reset();
    next();
    expect(budget.recordLoss()).toBe('remount');
  });

  it('a clock that goes back in time throws naming both instants', () => {
    const { budget, next } = budgetAt([30, 10]);
    next();
    budget.recordLoss();
    next();
    expect(() => budget.recordLoss()).toThrow(/10000.*30000/);
  });
});
