import { describe, expect, it } from 'vitest';
import { pressShiftKey } from '@/features/sheets/press-shift-key';
import { homeShortcutFor } from '@/lib/board-shortcuts';

function homeHeardOn(target: EventTarget, press: () => void): (string | null)[] {
  const heard: (string | null)[] = [];
  const listen = (event: Event): void => void heard.push(homeShortcutFor(event as KeyboardEvent));
  target.addEventListener('keydown', listen);
  press();
  target.removeEventListener('keydown', listen);
  return heard;
}

describe('pressShiftKey', () => {
  it('the room hears Shift+F on the window as the main sheet', () => {
    expect(homeHeardOn(window, () => pressShiftKey('F'))).toEqual(['main-sheet']);
  });

  it('Shift+M on the given target is the main map', () => {
    const target = new EventTarget();
    expect(homeHeardOn(target, () => pressShiftKey('M', target))).toEqual(['main-map']);
  });
});
