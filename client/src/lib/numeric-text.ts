/** Only the digits of what was typed: a whole-number field never holds anything else.
 *
 *  Example: `digitsOnly('2a1') // '21'` */
export function digitsOnly(typed: string): string {
  return typed.replace(/\D/g, '');
}

/** Digits and one decimal separator (comma or dot, the first one typed): "1,5" stays, "1,,5a"
 *  becomes "1,5".
 *
 *  Example: `decimalText('1,5,2') // '1,52'` */
export function decimalText(typed: string): string {
  const kept = typed.replace(/[^\d.,]/g, '');
  const separator = kept.search(/[.,]/);
  if (separator < 0) return kept;
  const whole = kept.slice(0, separator + 1);
  return whole + digitsOnly(kept.slice(separator + 1));
}
