/** How long the notice over the board shows a revealed roll. */
export const DICE_NOTICE_MS = 4000;

/** What the reveal reckoning reads of a history entry: a `secret` notice has no value to show. */
export type RevealEntry = Readonly<{ kind: 'rolled' | 'secret'; revealAtMs: number }>;

/** An entry narrowed to a roll with a value (a `DiceHistoryEntry` of kind `rolled`). */
export type RolledOf<E extends RevealEntry> = E & Readonly<{ kind: 'rolled' }>;

/** The soonest `revealAtMs + delayMs` still ahead of `now`, or `null` when there is none: the
 *  moment the screen's clock has to wake up (with a delay of `DICE_NOTICE_MS`, when a notice
 *  ends).
 *
 *  Example: `nextRevealAtOf(entries, clock.now()) // 2400` */
export function nextRevealAtOf(
  entries: readonly RevealEntry[],
  now: number,
  delayMs = 0,
): number | null {
  let soonest: number | null = null;
  for (const entry of entries) {
    const at = entry.revealAtMs + delayMs;
    if (at > now && (soonest === null || at < soonest)) soonest = at;
  }
  return soonest;
}

/** The roll revealed last by `now` among those that revealed after `shownAt` (when the screen
 *  appeared): what was already revealed then (an F5, a tab opened again) never counts, nor a
 *  secret notice.
 *
 *  Example: `latestRevealedOf(entries, now, shownAt)?.event.total // 22` */
export function latestRevealedOf<E extends RevealEntry>(
  entries: readonly E[],
  now: number,
  shownAt: number,
): RolledOf<E> | null {
  let latest: RolledOf<E> | null = null;
  for (const entry of entries) {
    if (!isRolled(entry) || entry.revealAtMs <= shownAt || entry.revealAtMs > now) continue;
    if (latest === null || entry.revealAtMs >= latest.revealAtMs) latest = entry;
  }
  return latest;
}

/** Whether the notice of a revealed roll still shows at `now`: from `revealAtMs` for
 *  `DICE_NOTICE_MS`.
 *
 *  Example: `isNoticeLive(entry, entry.revealAtMs + 3999) // true` */
export function isNoticeLive(entry: RevealEntry, now: number): boolean {
  return now >= entry.revealAtMs && now < entry.revealAtMs + DICE_NOTICE_MS;
}

function isRolled<E extends RevealEntry>(entry: E): entry is RolledOf<E> {
  return entry.kind === 'rolled';
}
