import { describe, expect, it } from 'vitest';
import { coneFieldOf, parseConeField } from '@/lib/cone-form';

describe('coneFieldOf', () => {
  it.each([
    [360, '360'],
    [90, '90'],
  ])('an opening of %s reads "%s"', (angle, text) => {
    expect(coneFieldOf(angle)).toBe(text);
  });
});

describe('parseConeField', () => {
  it('"90" is an opening of 90°', () => {
    expect(parseConeField('90')).toEqual({ ok: true, angle: 90 });
  });

  it('an empty field (spaces too) is every side, 360°', () => {
    expect(parseConeField('  ')).toEqual({ ok: true, angle: 360 });
  });

  it.each(['0', '361'])('"%s" is out of range: "De 1 a 360°."', (typed) => {
    expect(parseConeField(typed)).toEqual({ ok: false, error: 'De 1 a 360°.' });
  });

  it.each(['12,5', 'abc'])('"%s" is not whole degrees', (typed) => {
    expect(parseConeField(typed)).toEqual({
      ok: false,
      error: 'Use graus inteiros, de 1 a 360.',
    });
  });
});
