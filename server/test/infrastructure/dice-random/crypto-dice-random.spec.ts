import { describe, expect, it } from 'vitest';
import { CryptoDiceRandom } from '../../../src/infrastructure/dice-random/crypto-dice-random';
import { FixedIntSourceFake } from '../../support/dice-fakes';

describe('CryptoDiceRandom', () => {
  it('face(6) with the source answering 0 is 1', () => {
    expect(new CryptoDiceRandom(new FixedIntSourceFake(0).next).face(6)).toBe(1);
  });

  it('face(6) with the source answering 5 is 6, asking for a number below 6', () => {
    const source = new FixedIntSourceFake(5);
    expect(new CryptoDiceRandom(source.next).face(6)).toBe(6);
    expect(source.bounds).toEqual([6]);
  });

  it('face(1000) with the source at its maximum is 1000', () => {
    expect(new CryptoDiceRandom(new FixedIntSourceFake('max').next).face(1000)).toBe(1000);
  });

  it('unit() with the source at 0 is 0', () => {
    expect(new CryptoDiceRandom(new FixedIntSourceFake(0).next).unit()).toBe(0);
  });

  it('unit() with the source at its maximum stays below 1', () => {
    const unit = new CryptoDiceRandom(new FixedIntSourceFake('max').next).unit();
    expect(unit).toBeLessThan(1);
    expect(unit).toBeGreaterThan(0.999999);
  });

  it.each([1, 1001, 2.5, Number.NaN])(
    'face(%s) is refused with a RangeError citing 2 to 1000',
    (sides) => {
      const random = new CryptoDiceRandom(new FixedIntSourceFake(0).next);
      expect(() => random.face(sides)).toThrow(RangeError);
      expect(() => random.face(sides)).toThrow(
        `Die sides ${sides} is invalid: expected a whole number from 2 to 1000.`,
      );
    },
  );

  it('with the real crypto source, 200 faces of a d7 are whole numbers from 1 to 7', () => {
    const random = new CryptoDiceRandom();
    const faces = Array.from({ length: 200 }, () => random.face(7));
    expect(faces.every((face) => Number.isInteger(face) && face >= 1 && face <= 7)).toBe(true);
    expect(new Set(faces).size).toBe(7);
  });
});
