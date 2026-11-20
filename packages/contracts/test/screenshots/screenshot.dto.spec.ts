import { describe, expect, it } from 'vitest';
import { screenshotDto, screenshotIdsDto } from '../../src/screenshots/screenshot.dto';

const SHOT = (n: number): string => `00000000-0000-4000-8000-00000000000${n}`;

describe('screenshotIdsDto', () => {
  it('five distinct ids pass and a sixth is refused citing the count', () => {
    const five = [1, 2, 3, 4, 5].map(SHOT);

    expect(screenshotIdsDto.parse(five)).toEqual(five);
    expect(screenshotIdsDto.safeParse([...five, SHOT(6)]).error?.issues[0]?.message).toBe(
      '6 attachments: expected at most 5',
    );
  });

  it('an id listed twice is refused citing it', () => {
    expect(screenshotIdsDto.safeParse([SHOT(1), SHOT(1)]).error?.issues[0]?.message).toBe(
      `attachment ${SHOT(1)} is listed twice: expected each id once`,
    );
  });
});

describe('screenshotDto', () => {
  it('a GIF is not a kept screenshot type', () => {
    const shot = { id: SHOT(1), mimeType: 'image/gif', width: 1, height: 1, sizeBytes: 1 };

    expect(screenshotDto.safeParse(shot).success).toBe(false);
  });
});
