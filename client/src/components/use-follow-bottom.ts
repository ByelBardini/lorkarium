import { useCallback, useEffect, useRef, useState } from 'react';

// Within this many px of the end still counts as "at the bottom" (sub-pixel rounding, momentum).
const PINNED_SLACK_PX = 24;

/** The newest item of a feed: its key (`null` when empty) and whether the viewer sent it. */
export type FollowBottomLatest = Readonly<{ key: string | null; mine: boolean }>;

export type FollowBottom = Readonly<{
  scroller: React.RefObject<HTMLDivElement | null>;
  content: React.RefObject<HTMLDivElement | null>;
  /** Something arrived below while the reader was scrolled up ("Novas mensagens"). */
  hasUnseen: boolean;
  jumpToEnd: () => void;
}>;

type FollowState = { pinned: boolean; latestKey: string | null };

// `null` = at the end; otherwise the newest key when the reader left it.
type AwayFrom = Readonly<{ latestKey: string | null }> | null;

/** Keeps a feed at its end while the reader is there: a new item scrolls to it, and so does the
 *  content growing after mounting (a roll's card revealing, an avatar loading). Scrolled up, it
 *  leaves the reader where they are and reports `hasUnseen` instead; the viewer's own item still
 *  goes to the end. Getting back near the end turns following on again.
 *
 *  Example: `const follow = useFollowBottom({ key: last?.id ?? null, mine: last?.fromMe ?? false });` */
export function useFollowBottom(latest: FollowBottomLatest): FollowBottom {
  const { key, mine } = latest;
  const scroller = useRef<HTMLDivElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const state = useRef<FollowState>({ pinned: true, latestKey: key });
  const [away, setAway] = useState<AwayFrom>(null);
  useEffect(() => {
    state.current.latestKey = key;
    followArrival(scroller.current, state.current, { key, mine });
  }, [key, mine]);
  useEffect(() => followGrowth(scroller.current, content.current, state.current, setAway), []);
  const jumpToEnd = useCallback((): void => {
    if (scroller.current) scrollToEnd(scroller.current);
    state.current.pinned = true;
    setAway(null);
  }, []);
  const hasUnseen = away !== null && away.latestKey !== key && !mine;
  return { scroller, content, hasUnseen, jumpToEnd };
}

function followArrival(
  scroller: HTMLDivElement | null,
  state: FollowState,
  latest: FollowBottomLatest,
): void {
  if (!scroller || latest.key === null) return;
  if (!state.pinned && !latest.mine) return;
  scrollToEnd(scroller);
  state.pinned = true;
}

function followGrowth(
  scroller: HTMLDivElement | null,
  content: HTMLDivElement | null,
  state: FollowState,
  setAway: (update: (previous: AwayFrom) => AwayFrom) => void,
): (() => void) | undefined {
  if (!scroller || !content) return undefined;
  const onScroll = (): void => {
    const atEnd = isAtEnd(scroller);
    state.pinned = atEnd;
    setAway((previous) => (atEnd ? null : (previous ?? { latestKey: state.latestKey })));
  };
  const observer = new ResizeObserver(() => {
    if (state.pinned) scrollToEnd(scroller);
  });
  scroller.addEventListener('scroll', onScroll);
  observer.observe(content);
  return () => {
    scroller.removeEventListener('scroll', onScroll);
    observer.disconnect();
  };
}

function isAtEnd(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= PINNED_SLACK_PX;
}

function scrollToEnd(element: HTMLElement): void {
  element.scrollTop = element.scrollHeight;
}
