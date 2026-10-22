import { useEffect, useState } from 'react';
import { awayLabelOf } from '@/lib/away-label';
import type { InteractionClock } from '@/lib/interaction-clock';

const MINUTE_MS = 60_000;

/** "ausente há N min" for a member away (`null` when active), counted from the server time of
 *  the last presence update plus the browser time since it arrived; re-reads every minute.
 *
 *  Example: `const away = useAwayLabel(member.awaySince, presence.at, deps.interactionClock)` */
export function useAwayLabel(
  awaySince: string | null,
  serverAt: string | null,
  clock: InteractionClock,
): string | null {
  const [seen, setSeen] = useState(() => ({ serverAt, localMs: clock.now() }));
  if (seen.serverAt !== serverAt) setSeen({ serverAt, localMs: clock.now() });
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    if (!awaySince) return undefined;
    let cancel = clock.after(MINUTE_MS, tick);
    function tick(): void {
      setNow(clock.now());
      cancel = clock.after(MINUTE_MS, tick);
    }
    return () => cancel();
  }, [awaySince, clock]);
  if (!awaySince || !serverAt) return null;
  return awayLabelOf(awaySince, serverAt, Math.max(now - seen.localMs, 0));
}
