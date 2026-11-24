/** Presses Shift+`key` on the app's window for a sheet whose frame has the focus: the room's
 *  keys (Shift+F, Shift+M, Shift+B) listen there and never hear a key typed inside the frame.
 *
 *  Example: `createSheetBridgeHost({ ..., onShortcut: (key) => pressShiftKey(key) })` */
export function pressShiftKey(key: string, target: EventTarget = window): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: true, cancelable: true }));
}
