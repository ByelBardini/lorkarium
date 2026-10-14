import { describe, expect, it } from 'vitest';
import { snapToCell } from '../../../src/features/board/token-list';

describe('snapToCell', () => {
  it('snaps a world coordinate to the start of its cell', () => {
    expect(snapToCell(130, 50)).toBe(100);
  });
});
