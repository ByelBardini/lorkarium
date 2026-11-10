import { describe, expect, it } from 'vitest';
import {
  cellIndexDto,
  halfCellDto,
  tokenBoxShape,
  tokenSideLengthDto,
} from '../../src/board/half-cell.dto';

function messagesOf(result: { error?: { issues: { message: string }[] } }): string[] {
  return result.error?.issues.map(({ message }) => message) ?? [];
}

describe('cellIndexDto', () => {
  it.each([0, 2.5, 1.015625, 3 + 63 / 64])('position %s is accepted as sent', (position) => {
    expect(cellIndexDto.parse(position)).toBe(position);
  });

  it.each([0.01, 1.3, 1 / 128])('position %s off the 1/64 step is refused', (position) => {
    expect(messagesOf(cellIndexDto.safeParse(position))).toEqual([
      `cell ${position} is invalid; expected a multiple of 1/64 from 0 to ${Number.MAX_SAFE_INTEGER}`,
    ]);
  });

  it('a position one step below zero is refused citing the value', () => {
    expect(messagesOf(cellIndexDto.safeParse(-1 / 64))).toEqual([
      expect.stringContaining('cell -0.015625 is invalid'),
    ]);
  });

  it('a position past the largest safe integer is refused', () => {
    expect(cellIndexDto.safeParse(Number.MAX_SAFE_INTEGER * 2).success).toBe(false);
  });
});

describe('tokenSideLengthDto', () => {
  it('a side on the 1/64 step of a position is refused citing the half cell', () => {
    expect(messagesOf(tokenSideLengthDto.safeParse(1.015625))).toEqual([
      'token side 1.015625 is invalid; expected a multiple of 0.5 from 0.5 to 10',
    ]);
  });

  it.each([0.5, 10])('side %s at the limits is accepted', (side) => {
    expect(tokenSideLengthDto.parse(side)).toBe(side);
  });

  it.each([0, 10.5])('side %s past the limits is refused', (side) => {
    expect(tokenSideLengthDto.safeParse(side).success).toBe(false);
  });
});

describe('halfCellDto', () => {
  it('names the noun and the range it was built with when refusing', () => {
    expect(messagesOf(halfCellDto('width', 1, 4).safeParse(4.5))).toEqual([
      'width 4.5 is invalid; expected a multiple of 0.5 from 1 to 4',
    ]);
  });
});

describe('tokenBoxShape', () => {
  it('the origin of a box takes the fine step and its size keeps the half cell', () => {
    expect(tokenBoxShape.col.safeParse(1.015625).success).toBe(true);
    expect(tokenBoxShape.row.safeParse(1.015625).success).toBe(true);
    expect(tokenBoxShape.width.safeParse(1.015625).success).toBe(false);
    expect(tokenBoxShape.height.safeParse(1.015625).success).toBe(false);
  });
});
