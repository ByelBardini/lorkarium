import type { KeyboardEvent } from 'react';

const FOCUS_STEP: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };

// Roving focus over the tabs (the close buttons keep their own place in the Tab order).
/** Moves the focus to the next or previous `role="tab"` of a tablist on the arrow keys, wrapping
 *  around the ends.
 *
 *  Example: `<div role="tablist" onKeyDown={moveFocusAlongTabs}>` */
export function moveFocusAlongTabs(event: KeyboardEvent<HTMLElement>): void {
  const step = FOCUS_STEP[event.key];
  if (step === undefined) return;
  const all = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
  const at = all.findIndex((tab) => tab === document.activeElement);
  if (at === -1) return;
  event.preventDefault();
  all[(at + step + all.length) % all.length]?.focus();
}
