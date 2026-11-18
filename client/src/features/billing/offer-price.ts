import type {
  BillingMethod,
  BillingPeriod,
  BillingPlan,
  BillingPriceDto,
  BillingPriceKey,
} from '@lorkarium/contracts';
import { brlOf } from './billing-messages';

/** How a plan's price reads on its offer: the month it comes to (split for the big numeral), the
 *  monthly price struck through past one month, what is charged and how much it saves. */
export type OfferPrice = Readonly<{
  priceKey: BillingPriceKey;
  months: number;
  totalCents: number;
  /** What the same months would cost at the monthly price (the subtotal before the discount). */
  fullCents: number;
  /** The discount over `fullCents`, rounded to a whole percent; 0 on the monthly price. */
  savingPercent: number;
  reais: string;
  cents: string;
  was: string | null;
  billed: string;
  saving: string | null;
}>;

const PIX_SPAN: Readonly<Record<BillingPeriod, string>> = {
  monthly: '1 mês',
  semiannual: '6 meses',
  annual: '1 ano',
};

/** The offer of `plan` in `period` from the catalog the server sent; null when it is not there.
 *
 *  Example: `offerPriceOf(prices, 'narrador', 'annual', 'card')?.billed // 'R$ 142,90 por ano'` */
export function offerPriceOf(
  prices: readonly BillingPriceDto[],
  plan: BillingPlan,
  period: BillingPeriod,
  method: BillingMethod,
): OfferPrice | null {
  const price = priceIn(prices, plan, period);
  if (price === null) return null;
  const monthly = priceIn(prices, plan, 'monthly');
  const [reais = '0', cents = '00'] = (Math.round(price.amountCents / price.months) / 100)
    .toFixed(2)
    .split('.');
  const fullCents = monthly === null ? price.amountCents : monthly.amountCents * price.months;
  const saving = fullCents - price.amountCents;
  return {
    priceKey: price.priceKey,
    months: price.months,
    totalCents: price.amountCents,
    fullCents,
    savingPercent: Math.round((100 * saving) / fullCents),
    reais,
    cents: `,${cents}`,
    was: monthly === null || price.months === 1 ? null : `${brlOf(monthly.amountCents)}/mês`,
    billed: billedOf(price, method),
    saving: saving > 0 ? brlOf(saving) : null,
  };
}

/** The biggest whole-percent discount of `period` in the catalog (the "até N%" of its option).
 *
 *  Example: `bestSavingPercentOf(prices, 'annual') // 20` */
export function bestSavingPercentOf(
  prices: readonly BillingPriceDto[],
  period: BillingPeriod,
): number {
  const percents = prices.flatMap((price) => {
    if (price.period !== period) return [];
    const monthly = priceIn(prices, price.plan, 'monthly');
    if (monthly === null) return [];
    return [100 * (1 - price.amountCents / (monthly.amountCents * price.months))];
  });
  return Math.floor(Math.max(0, ...percents));
}

function billedOf(price: BillingPriceDto, method: BillingMethod): string {
  const total = brlOf(price.amountCents);
  if (method === 'pix') {
    const span = PIX_SPAN[price.period];
    return price.period === 'monthly'
      ? `Pago de uma vez, vale ${span}`
      : `${total} de uma vez, vale ${span}`;
  }
  if (price.period === 'monthly') return 'Cobrado todo mês no cartão';
  return price.period === 'annual' ? `${total} por ano` : `${total} a cada 6 meses`;
}

function priceIn(
  prices: readonly BillingPriceDto[],
  plan: BillingPlan,
  period: BillingPeriod,
): BillingPriceDto | null {
  return prices.find((price) => price.plan === plan && price.period === period) ?? null;
}
