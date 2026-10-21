import { describe, expect, it } from 'vitest';
import { coneAngleDto, facingDto } from '../../src/board/direction.dto';

function messagesOf(result: { error?: { issues: { message: string }[] } }): string[] {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('facingDto', () => {
  it('a whole angle from 0 to 359 is accepted', () => {
    expect(facingDto.parse(0)).toBe(0);
    expect(facingDto.parse(359)).toBe(359);
  });

  it.each([360, -1, 12.5])('a facing of %s is refused citing the value and 0 to 359', (value) => {
    expect(messagesOf(facingDto.safeParse(value))).toEqual([
      `facing ${value} is invalid; expected a whole number from 0 to 359`,
    ]);
  });
});

describe('coneAngleDto', () => {
  it('a sight angle of 90 is accepted as sent', () => {
    expect(coneAngleDto('sight').parse(90)).toBe(90);
  });

  it('the edges 1 and 360 are accepted', () => {
    expect(coneAngleDto('light').parse(1)).toBe(1);
    expect(coneAngleDto('light').parse(360)).toBe(360);
  });

  it.each([0, 361, 12.5, Number.NaN])(
    'a sight angle of %s is refused citing the value and 1 to 360',
    (value) => {
      expect(messagesOf(coneAngleDto('sight').safeParse(value))).toEqual([
        `sight angle ${value} is invalid; expected a whole number from 1 to 360`,
      ]);
    },
  );

  it('a refused light angle names the light', () => {
    expect(messagesOf(coneAngleDto('light').safeParse(0))).toEqual([
      'light angle 0 is invalid; expected a whole number from 1 to 360',
    ]);
  });
});
