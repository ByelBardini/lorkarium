import { describe, expect, it } from 'vitest';
import { maskedCpfOf } from '@/lib/supplier-identity';

// Test CPFs with valid check digits, worked out by hand; none belongs to the supplier.
const VALID_CPF = '52998224725';

describe('maskedCpfOf', () => {
  it('keeps only the middle six digits, as the LGPD-friendly ***.982.247-** mask', () => {
    expect(maskedCpfOf(VALID_CPF)).toBe('***.982.247-**');
  });

  it('reads the punctuated form the same way', () => {
    expect(maskedCpfOf('529.982.247-25')).toBe('***.982.247-**');
  });

  it.each([
    ['5299822472', 10],
    ['529982247250', 12],
  ])('refuses %s, naming its %i digits and the 11 expected', (cpf, length) => {
    expect(() => maskedCpfOf(cpf)).toThrow(new RegExp(`${length} digits.*11 dígitos`));
  });

  it('refuses a CPF whose check digit does not match', () => {
    expect(() => maskedCpfOf('52998224724')).toThrow(/dígito verificador/);
  });

  it('refuses a repeated-digit CPF even though its check digits "match"', () => {
    expect(() => maskedCpfOf('11111111111')).toThrow(/dígito verificador/);
  });

  it('never echoes the raw CPF in the error, since it lands in the build log', () => {
    expect(() => maskedCpfOf('52998224724')).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('52998224724') }),
    );
  });
});
