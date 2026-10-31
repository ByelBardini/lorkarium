import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useElementWidth } from '@/lib/use-element-width';
import { fakeClientWidth } from '../support/client-width-fake';

class ResizeObserverSpy implements ResizeObserver {
  static last: ResizeObserverSpy | null = null;
  disconnected = false;
  constructor(private readonly notify: ResizeObserverCallback) {
    ResizeObserverSpy.last = this;
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  resize(): void {
    this.notify([], this);
  }
}

function MeasuredStrip(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);
  return <div ref={ref}>{width}</div>;
}

describe('useElementWidth', () => {
  const original = globalThis.ResizeObserver;
  let width = 240;
  let restoreWidth: () => void = () => {};
  afterEach(() => {
    globalThis.ResizeObserver = original;
    restoreWidth();
  });

  it('reads the width on mount, follows each resize and stops on unmount', () => {
    globalThis.ResizeObserver = ResizeObserverSpy;
    restoreWidth = fakeClientWidth(() => width);
    const { unmount } = render(<MeasuredStrip />);
    expect(screen.getByText('240')).toBeInTheDocument();
    width = 512;
    act(() => ResizeObserverSpy.last?.resize());
    expect(screen.getByText('512')).toBeInTheDocument();
    unmount();
    expect(ResizeObserverSpy.last?.disconnected).toBe(true);
  });
});
