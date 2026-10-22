import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTabActivity } from '@/features/sessions/use-tab-activity';
import { TABLE_IDLE_MS } from '@/lib/idle-watch';
import { InteractionClockFake } from '../../support/interaction-clock-fake';

function Watcher({
  clock,
  onAway,
}: Readonly<{ clock: InteractionClockFake; onAway: (away: boolean) => void }>) {
  useTabActivity({ clock, onAway });
  return null;
}

function hideTheTab(hidden: boolean): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  });
}

describe('useTabActivity', () => {
  let clock: InteractionClockFake;
  let changes: boolean[];

  beforeEach(() => {
    clock = new InteractionClockFake();
    changes = [];
    render(<Watcher clock={clock} onAway={(away) => changes.push(away)} />);
    act(() => clock.advance(TABLE_IDLE_MS));
  });

  afterEach(() => hideTheTab(false));

  it('10 minutes without anything say away', () => {
    expect(changes).toEqual([true]);
  });

  it('a pointerdown on the window counts as activity', () => {
    fireEvent.pointerDown(window);

    expect(changes).toEqual([true, false]);
  });

  it('a keydown on the window counts as activity', () => {
    fireEvent.keyDown(window, { key: 'a' });

    expect(changes).toEqual([true, false]);
  });

  it('activity while the tab is hidden does not count', () => {
    hideTheTab(true);

    fireEvent.keyDown(window, { key: 'a' });

    expect(changes).toEqual([true]);
  });
});
