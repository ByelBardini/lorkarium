import { afterEach, describe, expect, it } from 'vitest';
import { holdBackBrowserMenu } from '@/renderer/host-listeners';

const BOARD_RECT = { left: 100, top: 100, right: 500, bottom: 400, width: 400, height: 300 };

function boardHost(): HTMLElement {
  const host = document.createElement('div');
  host.getBoundingClientRect = () => ({ ...BOARD_RECT, x: 100, y: 100, toJSON: () => null });
  document.body.append(host);
  return host;
}

function rightClickAt(x: number, y: number, target: Element = document.body): MouseEvent {
  const event = new MouseEvent('contextmenu', {
    clientX: x,
    clientY: y,
    cancelable: true,
    bubbles: true,
  });
  target.dispatchEvent(event);
  return event;
}

describe('holdBackBrowserMenu', () => {
  afterEach(() => document.body.replaceChildren());

  it('cancels the browser menu for a right click inside the board, wherever it lands', () => {
    const dispose = holdBackBrowserMenu(boardHost());
    expect(rightClickAt(200, 200).defaultPrevented).toBe(true);
    dispose();
  });

  it('leaves the menu of a click outside the board, and of a text field inside it', () => {
    const dispose = holdBackBrowserMenu(boardHost());
    const field = document.createElement('input');
    document.body.append(field);
    expect(rightClickAt(50, 50).defaultPrevented).toBe(false);
    expect(rightClickAt(200, 200, field).defaultPrevented).toBe(false);
    dispose();
  });

  it('after the disposer runs, the browser menu is back', () => {
    holdBackBrowserMenu(boardHost())();
    expect(rightClickAt(200, 200).defaultPrevented).toBe(false);
  });
});
