import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useFollowBottom } from '@/features/chat/use-follow-bottom';

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

function Feed({ count }: Readonly<{ count: number }>): React.JSX.Element {
  const { scroller, content } = useFollowBottom(count);
  return (
    <div ref={scroller} data-testid="scroller">
      <div ref={content} />
    </div>
  );
}

function setBox(element: HTMLElement, box: { scrollHeight: number; clientHeight: number }): void {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: box.scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: box.clientHeight });
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
    const { getByTestId } = render(<Feed count={3} />);
    const scroller = getByTestId('scroller');
    setBox(scroller, { scrollHeight: 900, clientHeight: 300 });
    FakeResizeObserver.latest?.resize();
    expect(scroller.scrollTop).toBe(900);
  });

  it('leaves the reader where they are when they had scrolled up', () => {
    const { getByTestId } = render(<Feed count={3} />);
    const scroller = getByTestId('scroller');
    setBox(scroller, { scrollHeight: 900, clientHeight: 300 });
    scroller.scrollTop = 100;
    scroller.dispatchEvent(new Event('scroll'));
    FakeResizeObserver.latest?.resize();
    expect(scroller.scrollTop).toBe(100);
  });
});
