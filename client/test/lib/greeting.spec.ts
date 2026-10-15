import { describe, expect, it } from 'vitest';
import { GREETINGS, greetingFor } from '@/lib/greeting';

describe('greetingFor', () => {
  it('draw 0 with "Lucas Rola" greets the first name with the first variation', () => {
    expect(greetingFor('Lucas Rola', 0)).toBe('E aí, Lucas.');
  });

  it('draw 0.95 picks the tenth variation', () => {
    expect(greetingFor('Lucas Rola', 0.95)).toBe('De volta à taverna, Lucas.');
  });

  it('draw 0.75 picks the eighth variation, the question', () => {
    expect(greetingFor('Ana', 0.75)).toBe('Bora rolar uns dados, Ana?');
  });

  it('trims spaces around the name before taking the first name', () => {
    expect(greetingFor('   Ana  Souza ', 0)).toBe('E aí, Ana.');
  });

  it.each([1, -0.1])('a draw of %s is a RangeError citing the value', (draw) => {
    expect(() => greetingFor('Ana', draw)).toThrow(RangeError);
    expect(() => greetingFor('Ana', draw)).toThrow(String(draw));
  });

  it('has ten distinct variations', () => {
    expect(new Set(GREETINGS).size).toBe(10);
  });
});
