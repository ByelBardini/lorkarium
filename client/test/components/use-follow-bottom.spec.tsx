import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NewMessagesNotice } from '@/components/new-messages-notice';
import { useFollowBottom, type FollowBottomLatest } from '@/components/use-follow-bottom';

class FakeResizeObserver implements ResizeObserver {
  static latest: FakeResizeObserver | null = null;
  constructor(private readonly onResize: ResizeObserverCallback) {
    FakeResizeObserver.latest = this;
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  resize(): void {
    this.onResize([], this);
  }
}

function Feed({ latest }: Readonly<{ latest: FollowBottomLatest }>): React.JSX.Element {
  const { scroller, content, hasUnseen, jumpToEnd } = useFollowBottom(latest);
  return (
    <div>
      <div ref={scroller} data-testid="scroller">
        <div ref={content} />
      </div>
      {hasUnseen && <NewMessagesNotice onJump={jumpToEnd} />}
    </div>
  );
}

const FIRST: FollowBottomLatest = { key: 'm1', mine: false };
const FROM_OTHER: FollowBottomLatest = { key: 'm2', mine: false };
const MINE: FollowBottomLatest = { key: 'm2', mine: true };
const NOTICE = { name: 'Novas mensagens' };

function setBox(element: HTMLElement, box: { scrollHeight: number; clientHeight: number }): void {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: box.scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: box.clientHeight });
}

function scrollTo(element: HTMLElement, top: number): void {
  act(() => {
    element.scrollTop = top;
    element.dispatchEvent(new Event('scroll'));
  });
}

type Mounted = Readonly<{ scroller: HTMLElement; rerender: (latest: FollowBottomLatest) => void }>;

function mountScrolledUp(): Mounted {
  const view = render(<Feed latest={FIRST} />);
  const scroller = screen.getByTestId('scroller');
  setBox(scroller, { scrollHeight: 900, clientHeight: 300 });
  scrollTo(scroller, 100);
  return { scroller, rerender: (latest) => view.rerender(<Feed latest={latest} />) };
}

function arrive(mounted: Mounted, latest: FollowBottomLatest, scrollHeight: number): void {
  setBox(mounted.scroller, { scrollHeight, clientHeight: 300 });
  mounted.rerender(latest);
}

describe('useFollowBottom', () => {
  const original = globalThis.ResizeObserver;
  beforeEach(() => {
    globalThis.ResizeObserver = FakeResizeObserver;
  });
  afterEach(() => {
    globalThis.ResizeObserver = original;
  });

  it('stays at the end when the content grows after mounting (a roll revealing)', () => {
    render(<Feed latest={FIRST} />);
    const scroller = screen.getByTestId('scroller');
    setBox(scroller, { scrollHeight: 900, clientHeight: 300 });
    FakeResizeObserver.latest?.resize();
    expect(scroller.scrollTop).toBe(900);
  });

  it('leaves the reader where they are when the content grows after they scrolled up', () => {
    const { scroller } = mountScrolledUp();
    FakeResizeObserver.latest?.resize();
    expect(scroller.scrollTop).toBe(100);
  });

  it('at the end, a new message from someone else scrolls to it', () => {
    const mounted = mountScrolledUp();
    scrollTo(mounted.scroller, 600);
    arrive(mounted, FROM_OTHER, 1000);
    expect(mounted.scroller.scrollTop).toBe(1000);
    expect(screen.queryByRole('button', NOTICE)).not.toBeInTheDocument();
  });

  it('scrolled up, a new message from someone else keeps the position and offers the notice', () => {
    const mounted = mountScrolledUp();
    arrive(mounted, FROM_OTHER, 1000);
    expect(mounted.scroller.scrollTop).toBe(100);
    expect(screen.getByRole('button', NOTICE)).toBeInTheDocument();
  });

  it('scrolled up, my own message still takes me to the end', () => {
    const mounted = mountScrolledUp();
    arrive(mounted, MINE, 1000);
    expect(mounted.scroller.scrollTop).toBe(1000);
    expect(screen.queryByRole('button', NOTICE)).not.toBeInTheDocument();
  });

  it('scrolled up with nothing new, offers no notice', () => {
    mountScrolledUp();
    expect(screen.queryByRole('button', NOTICE)).not.toBeInTheDocument();
  });

  it('getting back near the end hides the notice and turns following back on', () => {
    const mounted = mountScrolledUp();
    arrive(mounted, FROM_OTHER, 1000);
    scrollTo(mounted.scroller, 690);
    expect(screen.queryByRole('button', NOTICE)).not.toBeInTheDocument();
    arrive(mounted, { key: 'm3', mine: false }, 1100);
    expect(mounted.scroller.scrollTop).toBe(1100);
  });

  it('the notice jumps to the end and turns following back on', async () => {
    const mounted = mountScrolledUp();
    arrive(mounted, FROM_OTHER, 1000);
    await userEvent.click(screen.getByRole('button', NOTICE));
    expect(mounted.scroller.scrollTop).toBe(1000);
    expect(screen.queryByRole('button', NOTICE)).not.toBeInTheDocument();
    arrive(mounted, { key: 'm3', mine: false }, 1100);
    expect(mounted.scroller.scrollTop).toBe(1100);
  });
});
