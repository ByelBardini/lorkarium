const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });
const DAY_AND_MONTH = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' });

/** The date above the home greeting, short weekday without "-feira", in local time.
 *
 *  Example: `formatOverlineDate(new Date(2026, 9, 14)) // 'Quarta, 14 de outubro'` */
export function formatOverlineDate(date: Date): string {
  const weekday = WEEKDAY.format(date).replace('-feira', '');
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${capitalized}, ${DAY_AND_MONTH.format(date)}`;
}
