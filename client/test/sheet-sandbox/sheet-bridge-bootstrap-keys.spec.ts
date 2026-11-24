import { beforeEach, describe, expect, it } from 'vitest';
import { SHEET_BRIDGE_BOOTSTRAP } from '@/sheet-sandbox/sheet-bridge-bootstrap';
import { SheetFrameWindowFake, SheetPortFake } from '../support/sheet-frame-fakes';

let frame: SheetFrameWindowFake;
let port: SheetPortFake;

// The exact text the srcdoc embeds, run with the fake as its `window`.
beforeEach(() => {
  frame = new SheetFrameWindowFake();
  new Function('window', SHEET_BRIDGE_BOOTSTRAP)(frame);
  port = new SheetPortFake();
  frame.handOff(port);
});

function fieldIn(tag: string): HTMLElement {
  const element = document.createElement(tag);
  document.body.append(element);
  return element;
}

describe('sheet bridge bootstrap: Shift+letter goes to the host', () => {
  it('a real Shift+F on the sheet is sent as a shortcut', () => {
    frame.pressKey({ target: fieldIn('button') });
    expect(port.sent).toEqual([{ type: 'shortcut', key: 'F' }]);
  });

  it('with Caps Lock the letter goes as it came', () => {
    frame.pressKey({ key: 'm' });
    expect(port.sent).toEqual([{ type: 'shortcut', key: 'm' }]);
  });

  it('pressed before the port arrives, it waits for the port', () => {
    const early = new SheetFrameWindowFake();
    new Function('window', SHEET_BRIDGE_BOOTSTRAP)(early);
    early.pressKey();
    const later = new SheetPortFake();
    early.handOff(later);
    expect(later.sent).toEqual([{ type: 'shortcut', key: 'F' }]);
  });

  it('typed in a field of the sheet it stays there', () => {
    for (const tag of ['input', 'textarea', 'select']) frame.pressKey({ target: fieldIn(tag) });
    const editable = fieldIn('div');
    editable.contentEditable = 'true';
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    frame.pressKey({ target: editable });
    expect(port.sent).toEqual([]);
  });

  it('a key held down, kept by the author, or made up by a script is not sent', () => {
    frame.pressKey({ repeat: true });
    frame.pressKey({ defaultPrevented: true });
    frame.pressKey({ isTrusted: false });
    expect(port.sent).toEqual([]);
  });

  it('without Shift, with Ctrl/⌘/Alt, or on a key that is not a letter, nothing is sent', () => {
    frame.pressKey({ shiftKey: false });
    frame.pressKey({ ctrlKey: true });
    frame.pressKey({ metaKey: true });
    frame.pressKey({ altKey: true });
    for (const key of ['!', 'Enter', 'Ç']) frame.pressKey({ key });
    expect(port.sent).toEqual([]);
  });
});
