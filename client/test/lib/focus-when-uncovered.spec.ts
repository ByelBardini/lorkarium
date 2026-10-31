// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { focusWhenUncovered } from '@/lib/focus-when-uncovered';

// A Radix modal marks the rest of the page `aria-hidden` while it is open (hideOthers).
function pageUnderModal(): { room: HTMLElement; title: HTMLInputElement } {
  const room = document.createElement('div');
  room.setAttribute('aria-hidden', 'true');
  const title = document.createElement('input');
  room.append(title);
  document.body.append(room);
  return { room, title };
}
const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('focusWhenUncovered', () => {
  afterEach(() => document.body.replaceChildren());

  it('focuses at once when no modal hides the element', () => {
    const title = document.createElement('input');
    document.body.append(title);
    focusWhenUncovered(title);
    expect(document.activeElement).toBe(title);
  });

  it('waits while a modal hides the page and focuses when the modal lets go', async () => {
    const { room, title } = pageUnderModal();
    focusWhenUncovered(title);
    expect(document.activeElement).not.toBe(title);
    room.removeAttribute('aria-hidden');
    await settled();
    expect(document.activeElement).toBe(title);
  });

  it('gives up when the cleanup runs before the modal closes', async () => {
    const { room, title } = pageUnderModal();
    focusWhenUncovered(title)();
    room.removeAttribute('aria-hidden');
    await settled();
    expect(document.activeElement).not.toBe(title);
  });

  it('keeps waiting while another hidden ancestor still covers the element', async () => {
    const { room, title } = pageUnderModal();
    document.body.setAttribute('aria-hidden', 'true');
    focusWhenUncovered(title);
    room.removeAttribute('aria-hidden');
    await settled();
    expect(document.activeElement).not.toBe(title);
    document.body.removeAttribute('aria-hidden');
    await settled();
    expect(document.activeElement).toBe(title);
  });

  it('waits while an open modal elsewhere still traps the focus, then focuses as it unmounts', async () => {
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('data-state', 'open');
    const title = document.createElement('input');
    document.body.append(modal, title);
    focusWhenUncovered(title);
    expect(document.activeElement).not.toBe(title);
    modal.remove();
    await settled();
    expect(document.activeElement).toBe(title);
  });

  it('focuses at once inside the open modal that holds it', () => {
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('data-state', 'open');
    const title = document.createElement('input');
    modal.append(title);
    document.body.append(modal);
    focusWhenUncovered(title);
    expect(document.activeElement).toBe(title);
  });
});
