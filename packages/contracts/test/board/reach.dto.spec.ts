import { describe, expect, it } from 'vitest';
import { reachSideDto } from '../../src/board/reach.dto';

function messagesOf(schema: ReturnType<typeof reachSideDto>, value: unknown): string[] {
  return schema.safeParse(value).error?.issues.map((issue) => issue.message) ?? [];
}

describe('reachSideDto', () => {
  it.each([0, 2.5, 100])('a reach of %s cells is accepted as sent', (value) => {
    expect(reachSideDto('light', 'dim').parse(value)).toBe(value);
  });

  it('a light bright of 100.01 is refused naming the light, the side and the value', () => {
    expect(messagesOf(reachSideDto('light', 'bright'), 100.01)).toEqual([
      'light bright 100.01 is invalid; expected 0 to 100 cells',
    ]);
  });

  it('a sight dim of NaN is refused naming the sight', () => {
    expect(messagesOf(reachSideDto('sight', 'dim'), Number.NaN)).toEqual([
      'sight dim NaN is invalid; expected 0 to 100 cells',
    ]);
  });

  it('a text is refused', () => {
    expect(reachSideDto('light', 'dim').safeParse('4').success).toBe(false);
  });
});
