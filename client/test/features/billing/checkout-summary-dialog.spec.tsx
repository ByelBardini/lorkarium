import type { BillingMethod } from '@lorkarium/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CheckoutSummaryDialog } from '@/features/billing/checkout-summary-dialog';
import { offerPriceOf } from '@/features/billing/offer-price';
import {
  BILLING_PRICES,
  BillingApiFake,
  CHECKOUT_URL,
  CheckoutNavigationFake,
} from '../../support/billing-api-fake';

const TERMS_LINE =
  'Ao continuar, você aceita os Termos de uso, inclusive as regras de planos e reembolso.';
const NOW = new Date('2026-11-18T12:00:00Z');

type RenderedDialog = { billingApi: BillingApiFake; navigation: CheckoutNavigationFake };

function renderDialog(method: BillingMethod = 'card'): RenderedDialog {
  const billingApi = new BillingApiFake();
  const navigation = new CheckoutNavigationFake();
  const price = offerPriceOf(BILLING_PRICES, 'narrador', 'monthly', method);
  if (price === null) throw new Error('the fake catalog has no narrador_monthly price');
  render(
    <CheckoutSummaryDialog
      choice={{ planName: 'Narrador', period: 'monthly', method, price }}
      now={NOW}
      billingApi={billingApi}
      goToCheckout={navigation.goTo}
      onClose={() => undefined}
    />,
  );
  return { billingApi, navigation };
}

describe('CheckoutSummaryDialog, the terms before paying', () => {
  it.each(['card', 'pix'] as const)(
    'with %s, says that continuing accepts the Terms of use, linked in a new tab',
    async (method) => {
      renderDialog(method);
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent(TERMS_LINE);
      const terms = screen.getByRole('link', { name: 'Termos de uso' });
      expect(terms).toHaveAttribute('href', '/api/legal/terms');
      expect(terms).toHaveAttribute('target', '_blank');
      expect(terms).toHaveAttribute('rel', 'noopener noreferrer');
    },
  );

  it('opening the terms does not ask the checkout; only "Continuar no Mercado Pago" does', async () => {
    const { billingApi, navigation } = renderDialog();
    await userEvent.click(await screen.findByRole('link', { name: 'Termos de uso' }));
    expect(billingApi.answers.callsOf('checkout')).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Continuar no Mercado Pago' }));
    expect(billingApi.answers.callsOf('checkout')).toEqual([
      { priceKey: 'narrador_monthly', method: 'card' },
    ]);
    expect(navigation.visited).toEqual([CHECKOUT_URL]);
  });
});
