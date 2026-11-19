import type { TabStorage } from '@/stores/scene-tabs-storage';

const DEPARTURE_KEY = 'lorkarium.checkoutDeparture';
// A JSON string, so "no paid plan before" (null) differs from "nothing held" (no key at all).
type HeldDeparture = Readonly<{ paidPlanUntil: string | null }>;

/** What the return page compares against: the end held when the browser left, or unknown. */
export type PaidPlanBeforeCheckout =
  Readonly<{ known: true; paidPlanUntil: string | null }> | Readonly<{ known: false }>;

/** Holds, in the tab, the paid end the account had when it left for the checkout: the return is
 *  a fresh load whose session may already carry the plan the webhook granted meanwhile. A blocked
 *  storage holds nothing (the return falls back to the session).
 *
 *  Example: `rememberPaidPlanBeforeCheckout(tabStorage, user.paidPlanUntil); goToCheckout(url)` */
export function rememberPaidPlanBeforeCheckout(
  storage: TabStorage,
  paidPlanUntil: string | null,
): void {
  const held: HeldDeparture = { paidPlanUntil };
  try {
    storage.setItem(DEPARTURE_KEY, JSON.stringify(held));
  } catch {
    // Site data blocked: the return page reads the session instead.
  }
}

/** Reads and drops what `rememberPaidPlanBeforeCheckout` held: one checkout, one return.
 *
 *  Example: `const before = takePaidPlanBeforeCheckout(tabStorage); if (before.known) …` */
export function takePaidPlanBeforeCheckout(storage: TabStorage): PaidPlanBeforeCheckout {
  try {
    const raw = storage.getItem(DEPARTURE_KEY);
    storage.removeItem(DEPARTURE_KEY);
    return raw === null ? { known: false } : heldOf(raw);
  } catch {
    return { known: false };
  }
}

function heldOf(raw: string): PaidPlanBeforeCheckout {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || !('paidPlanUntil' in parsed)) {
    return { known: false };
  }
  const until = parsed.paidPlanUntil;
  return typeof until === 'string' || until === null
    ? { known: true, paidPlanUntil: until }
    : { known: false };
}
