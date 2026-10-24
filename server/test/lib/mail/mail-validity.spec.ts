import { describe, expect, it } from 'vitest';
import { validityLabel } from '../../../src/lib/mail/mail-validity';

describe('validityLabel', () => {
  it.each([
    [{ minutes: 30 }, '30 minutos'],
    [{ minutes: 1 }, '1 minuto'],
    [{ hours: 1 }, '1 hora'],
    [{ hours: 2 }, '2 horas'],
    [{ days: 1 }, '1 dia'],
    [{ days: 7 }, '7 dias'],
  ] as const)('%o reads "%s"', (validity, label) => {
    expect(validityLabel(validity)).toBe(label);
  });

  it.each([[{ days: 0 }], [{ hours: 1.5 }], [{ minutes: -3 }]] as const)(
    '%o is refused citing the value and the expected shape',
    (validity) => {
      expect(() => validityLabel(validity)).toThrow(/inteiro ≥ 1/);
      expect(() => validityLabel(validity)).toThrow(JSON.stringify(validity));
    },
  );
});
