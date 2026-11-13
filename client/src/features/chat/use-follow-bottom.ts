import { useEffect, useRef } from 'react';

// Within this many px of the end still counts as "at the bottom" (sub-pixel rounding, momentum).
const PINNED_SLACK_PX = 24;

export type FollowBottomRefs = Readonly<{
  scroller: React.RefObject<HTMLDivElement | null>;
  content: React.RefObject<HTMLDivElement | null>;
}>;

/** Keeps a scroller at its end: jumps there when `count` changes, and stays there while the
 *  content grows after mounting (a roll's card revealing, an avatar loading) as long as the
 *  reader had not scrolled up.
 *
 *  Example: `const { scroller, content } = useFollowBottom(items.length);` */
export function useFollowBottom(count: number): FollowBottomRefs {
  const scroller = useRef<HTMLDivElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const pinned = useRef(true);
  useEffect(() => {
    if (scroller.current) scrollToEnd(scroller.current);
  }, [count]);
  useEffect(() => followGrowth(scroller.current, content.current, pinned), []);
  return { scroller, content };
}

function followGrowth(
  scroller: HTMLDivElement | null,
  content: HTMLDivElement | null,
  pinned: { current: boolean },
): (() => void) | undefined {
  if (!scroller || !content) return undefined;
  const onScroll = (): void => {
    pinned.current = isAtEnd(scroller);
  };
  const observer = new ResizeObserver(() => {
    if (pinned.current) scrollToEnd(scroller);
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
