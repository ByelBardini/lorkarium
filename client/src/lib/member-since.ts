const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

/** Since when the person is around, as the profile preview says it (month and year, local time).
 *
 *  Example: `memberSinceLabel('2026-10-01T12:00:00.000Z') // 'Na mesa desde outubro de 2026'` */
export function memberSinceLabel(memberSince: string): string {
  const date = new Date(memberSince);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`memberSince "${memberSince}" is not a date: expected an ISO instant`);
  }
  return `Na mesa desde ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
}
