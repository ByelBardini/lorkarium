import { afterEach, describe, expect, it } from 'vitest';
import { recognizeNodesOfOtherWindows } from '@/lib/cross-window-nodes';

type JsdomWindow = Window & typeof globalThis;

// Each spec gets two fresh windows (iframes are realms of their own in jsdom): the patch is
// permanent on its home window, so the main window is never the home here.
function freshWindow(): JsdomWindow {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const view = frame.contentWindow;
  if (!view) throw new Error('jsdom gave no contentWindow to a connected iframe');
  return view as JsdomWindow;
}

describe('recognizeNodesOfOtherWindows', () => {
  afterEach(() => document.body.replaceChildren());

  it('without it, a node of another window is not a Node of the home window', () => {
    const home = freshWindow();
    const other = freshWindow();

    expect(other.document.createElement('div') instanceof home.Node).toBe(false);
  });

  it('a node of another window becomes a Node and an Element of the home window', () => {
    const home = freshWindow();
    const other = freshWindow();

    recognizeNodesOfOtherWindows(home);
    const div = other.document.createElement('div');

    expect(div instanceof home.Node).toBe(true);
    expect(div instanceof home.Element).toBe(true);
    expect(other.document instanceof home.Node).toBe(true);
  });

  it('each interface stays specific: a div of the other window is not an input', () => {
    const home = freshWindow();
    const other = freshWindow();

    recognizeNodesOfOtherWindows(home);

    expect(other.document.createElement('div') instanceof home.HTMLInputElement).toBe(false);
    expect(other.document.createElement('input') instanceof home.HTMLInputElement).toBe(true);
  });

  it('the home window nodes keep their answer and plain values are still not nodes', () => {
    const home = freshWindow();
    recognizeNodesOfOtherWindows(home);

    expect(home.document.createElement('span') instanceof home.Node).toBe(true);
    expect(home.document.createElement('span') instanceof home.HTMLInputElement).toBe(false);
    expect({ nodeType: 1 } instanceof home.Node).toBe(false);
    const nothing: unknown = null;
    expect(nothing instanceof home.Node).toBe(false);
  });

  it('a second call keeps the first check in place', () => {
    const home = freshWindow();
    recognizeNodesOfOtherWindows(home);
    const first = Object.getOwnPropertyDescriptor(home.Node, Symbol.hasInstance)?.value;

    recognizeNodesOfOtherWindows(home);

    expect(Object.getOwnPropertyDescriptor(home.Node, Symbol.hasInstance)?.value).toBe(first);
  });
});
