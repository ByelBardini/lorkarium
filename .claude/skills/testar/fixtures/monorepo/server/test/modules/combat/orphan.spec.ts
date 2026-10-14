import { describe, expect, it } from 'vitest';

describe('a scenario that mirrors no file', () => {
  it('a cross-cutting check still needs a real assertion', () => {
    expect([1, 2].includes(2)).toBe(true);
  });
});
