import { useEffect, useState } from 'react';
import type { BillingApi, BillingFailure } from '@/services/billing-api';
import { deletionBillingOf, type DeletionBilling } from './billing-admin-view';

/** The billing of the account about to be deleted: still loading, unreadable, or read. */
export type DeletionBillingState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'unread'; failure: BillingFailure }>
  | (Readonly<{ kind: 'read' }> & DeletionBilling);

/** Reads the billing of the account when the deletion dialog opens.
 *
 *  Example: `const billing = useDeletionBilling(billingApi, user.id); if (billing.kind === 'read') …` */
export function useDeletionBilling(
  api: Pick<BillingApi, 'adminAccount'>,
  userId: string,
): DeletionBillingState {
  const [state, setState] = useState<DeletionBillingState>({ kind: 'loading' });
  useEffect(() => {
    void api.adminAccount(userId).then((result) => {
      if (!result.ok) return setState({ kind: 'unread', failure: result.failure });
      setState({ kind: 'read', ...deletionBillingOf(result.value) });
    });
  }, [api, userId]);
  return state;
}

export type RenewalCancelStatus =
  | Readonly<{ kind: 'idle' | 'busy' | 'done' }>
  | Readonly<{ kind: 'failed'; failure: BillingFailure }>;

export type RenewalCancel = Readonly<{
  status: RenewalCancelStatus;
  /** Resolves `true` once the renewal is stopped (or there was none left to stop). */
  cancel: () => Promise<boolean>;
}>;

/** Stops the card renewal of the account before it is deleted. One idempotency key per dialog:
 *  a retry of the same deletion never cancels twice at the billing service.
 *
 *  Example: `const renewal = useRenewalCancel(billingApi, user.id); if (await renewal.cancel()) …` */
export function useRenewalCancel(
  api: Pick<BillingApi, 'adminCancel'>,
  userId: string,
): RenewalCancel {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [status, setStatus] = useState<RenewalCancelStatus>({ kind: 'idle' });
  const cancel = async (): Promise<boolean> => {
    setStatus({ kind: 'busy' });
    const result = await api.adminCancel(userId, idempotencyKey);
    setStatus(result.ok ? { kind: 'done' } : { kind: 'failed', failure: result.failure });
    return result.ok;
  };
  return { status, cancel };
}
