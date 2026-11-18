import type { BillingPriceDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { useLoaderData, type RouteObject } from 'react-router';
import type { AppDependencies } from '@/app/router';
import type { BillingResult } from '@/services/billing-api';
import { useSession } from '@/stores/session-store';
import { CheckoutReturnPage } from './checkout-return-page';
import { PlansPage } from './plans-page';

type PlansLoaderData = Readonly<{ prices: BillingResult<readonly BillingPriceDto[]> }>;

/** "Planos" (`/planos`, under the shell): the catalog the billing service answers, and the
 *  checkout of one price. A catalog that does not load shows inside the page.
 *
 *  Example: `{ id: 'shell', children: [accountRoute(deps), plansRoute(deps)] }` */
export function plansRoute(deps: AppDependencies): RouteObject {
  return {
    path: 'planos',
    loader: async (): Promise<PlansLoaderData> => ({ prices: await deps.billingApi.prices() }),
    Component: function PlansRoute(): React.JSX.Element | null {
      const { prices } = useLoaderData<PlansLoaderData>();
      const session = useSession(deps.sessionStore);
      const [now] = useState(deps.now);
      // The shell's guard lets only a signed-in account in.
      if (session.status !== 'authenticated') return null;
      const user = session.user;
      return (
        <PlansPage
          prices={prices}
          account={user}
          billingApi={deps.billingApi}
          goToCheckout={deps.goToCheckout}
          now={now}
        />
      );
    },
  };
}

/** Where the Mercado Pago sends the browser back (`/planos/retorno`): it waits for `/me` to bring
 *  the paid plan, since only the webhook grants it.
 *
 *  Example: `{ id: 'shell', children: [plansRoute(deps), checkoutReturnRoute(deps)] }` */
export function checkoutReturnRoute(deps: AppDependencies): RouteObject {
  return {
    path: 'planos/retorno',
    Component: function CheckoutReturnRoute(): React.JSX.Element {
      return (
        <CheckoutReturnPage
          authApi={deps.authApi}
          billingApi={deps.billingApi}
          sessionStore={deps.sessionStore}
          wait={deps.waitBeforeBillingCheck}
        />
      );
    },
  };
}
