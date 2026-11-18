/** The billing periods, in the order the page offers them. */
export type PlanPeriod = 'mensal' | 'semestral' | 'anual';

export const PLAN_PERIODS: readonly { key: PlanPeriod; label: string; months: number }[] = [
  { key: 'mensal', label: 'Mensal', months: 1 },
  { key: 'semestral', label: 'Semestral', months: 6 },
  { key: 'anual', label: 'Anual', months: 12 },
];

/** What one plan costs in each period, in whole cents of BRL. */
export type PlanPrices = Readonly<Record<PlanPeriod, number>>;

/** How a price reads on a plan: the month it comes to (split for the big numeral), the monthly
 *  price struck through when the period is longer, what is charged and how much it saves. */
export type PriceView = Readonly<{
  reais: string;
  cents: string;
  was: string | null;
  billed: string;
  saving: string | null;
}>;

/** Cents as reais, as the page writes them.
 *
 *  Example: `brl(1490) // 'R$ 14,90'` */
export function brl(cents: number): string {
  const [reais, rest] = (cents / 100).toFixed(2).split('.');
  return `R$ ${reais},${rest}`;
}

/** The price of a plan in a period.
 *
 *  Example: `priceView({ mensal: 1490, semestral: 7990, anual: 14290 }, 'anual').billed // 'R$ 142,90 por ano'` */
export function priceView(prices: PlanPrices, period: PlanPeriod): PriceView {
  const months = monthsOf(period);
  const total = prices[period];
  const [reais = '0', cents = '00'] = (Math.round(total / months) / 100).toFixed(2).split('.');
  const saving = prices.mensal * months - total;
  return {
    reais,
    cents: `,${cents}`,
    was: months === 1 ? null : `${brl(prices.mensal)}/mês`,
    billed: billedOf(total, period),
    saving: saving > 0 ? brl(saving) : null,
  };
}

/** The biggest whole-percent discount of the period among the plans (the "até N%" of its option).
 *
 *  Example: `bestSavingPercent([narrador], 'anual') // 20` */
export function bestSavingPercent(plans: readonly PlanPrices[], period: PlanPeriod): number {
  const months = monthsOf(period);
  const percents = plans.map((prices) => 100 * (1 - prices[period] / (prices.mensal * months)));
  return Math.floor(Math.max(0, ...percents));
}

function billedOf(total: number, period: PlanPeriod): string {
  if (period === 'mensal') return 'Cobrado todo mês';
  if (period === 'anual') return `${brl(total)} por ano`;
  return `${brl(total)} a cada 6 meses`;
}

function monthsOf(period: PlanPeriod): number {
  const found = PLAN_PERIODS.find((each) => each.key === period);
  if (found === undefined) throw new Error(`period ${period}: expected mensal, semestral or anual`);
  return found.months;
}
