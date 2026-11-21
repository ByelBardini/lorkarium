import { describe, expect, it } from 'vitest';
import { createClientErrorGate } from '@/lib/client-error-gate';

describe('createClientErrorGate', () => {
  it('admits the first 10 real errors of the page and refuses the 11th', () => {
    const gate = createClientErrorGate({ maxPerPage: 10 });
    const verdicts = Array.from({ length: 11 }, (_, index) => gate.admits(new Error(`e${index}`)));
    expect(verdicts).toEqual([...Array<boolean>(10).fill(true), false]);
  });

  it('an expected failure is refused and does not spend a slot', () => {
    const gate = createClientErrorGate({ maxPerPage: 1 });
    expect(gate.admits(new TypeError('Failed to fetch'))).toBe(false);
    expect(gate.admits(new Error('real'))).toBe(true);
  });
});
