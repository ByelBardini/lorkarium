import { CONDITION_ROUNDS_MAX } from '@lorkarium/contracts';

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

/** The rounds typed for a condition: empty or 0 is no limit (0), "2" is 2; anything that is not
 *  a whole number from 0 to 99 is `'invalid'`.
 *
 *  Example: `parseRounds('') // 0` · `parseRounds('abc') // 'invalid'` */
export function parseRounds(typed: string): number | 'invalid' {
  const text = typed.trim();
  if (text === '') return 0;
  if (!/^\d+$/.test(text)) return 'invalid';
  const rounds = Number(text);
  return rounds <= CONDITION_ROUNDS_MAX ? rounds : 'invalid';
}
