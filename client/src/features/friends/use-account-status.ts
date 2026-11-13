import { useSyncExternalStore } from 'react';
import type { AccountRealtime, AccountRealtimeStatus } from '@/services/account-realtime';

/** The status of the account socket, re-rendering on every change.
 *
 *  Example: `const live = useAccountStatus(deps.accountRealtime) === 'live'` */
export function useAccountStatus(account: AccountRealtime): AccountRealtimeStatus {
  return useSyncExternalStore(
    (onChange) => account.onStatus(onChange),
    () => account.status(),
  );
}
