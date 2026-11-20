const CPF_LENGTH = 11;
const CPF_PUNCTUATION = /[.\-\s]/g;

/**
 * The supplier's CPF as the terms publish it: only the middle six digits, after checking the
 * check digits so a typo in the build variable fails the build instead of shipping a wrong CPF.
 * Example: `maskedCpfOf('529.982.247-25') // '***.982.247-**'`
 */
export function maskedCpfOf(cpf: string): string {
  const digits = cpf.replace(CPF_PUNCTUATION, '');
  // The raw value is never echoed: the message lands in the build log.
  if (!/^\d+$/.test(digits) || digits.length !== CPF_LENGTH) {
    throw new Error(
      `LEGAL_SUPPLIER_CPF has ${digits.length} digits (or a non-digit); expected 11 dígitos`,
    );
  }
  if (!hasValidCheckDigits(digits)) {
    throw new Error('LEGAL_SUPPLIER_CPF fails the dígito verificador check; expected a real CPF');
  }
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

function hasValidCheckDigits(digits: string): boolean {
  if (/^(\d)\1+$/.test(digits)) return false;
  return (
    checkDigitOf(digits.slice(0, 9)) === digits[9] &&
    checkDigitOf(digits.slice(0, 10)) === digits[10]
  );
}

function checkDigitOf(prefix: string): string {
  const weightedSum = [...prefix].reduce(
    (sum, digit, index) => sum + Number(digit) * (prefix.length + 1 - index),
    0,
  );
  const remainder = (weightedSum * 10) % 11;
  return String(remainder === 10 ? 0 : remainder);
}
