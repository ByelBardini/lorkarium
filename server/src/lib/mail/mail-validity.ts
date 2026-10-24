/** How long a link lives, in the unit the e-mail should say. */
export type MailValidity =
  Readonly<{ minutes: number }> | Readonly<{ hours: number }> | Readonly<{ days: number }>;

/** The validity in words, for "O link vale …".
 *
 *  Example: `validityLabel({ days: 7 }) // '7 dias'` */
export function validityLabel(validity: MailValidity): string {
  const [amount, singular, plural] = unitOf(validity);
  if (!Number.isInteger(amount) || amount < 1) {
    throw new Error(
      `Mail validity ${JSON.stringify(validity)} is invalid: expected an inteiro ≥ 1 of minutes, hours or days`,
    );
  }
  return `${amount} ${amount === 1 ? singular : plural}`;
}

function unitOf(validity: MailValidity): readonly [number, string, string] {
  if ('minutes' in validity) return [validity.minutes, 'minuto', 'minutos'];
  if ('hours' in validity) return [validity.hours, 'hora', 'horas'];
  return [validity.days, 'dia', 'dias'];
}
