/** A key pressed in the frame, reduced to what the bootstrap reads (a `KeyboardEvent`). */
export interface SheetFrameKeyEvent {
  readonly key: string;
  readonly isTrusted: boolean;
  readonly repeat: boolean;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented: boolean;
  readonly target: unknown;
}

/** The frame's `window` as the key relay sees it. */
export interface SheetFrameKeyScope {
  addEventListener(type: 'keydown', listener: (event: SheetFrameKeyEvent) => void): void;
}

/** Starts the relay over `send` (the SDK's queue to the port). */
export type SheetFrameKeysInstaller = (
  scope: SheetFrameKeyScope,
  send: (message: object) => void,
) => void;

// Serialized by `toString` into the srcdoc, like the bootstrap: it may reference nothing outside
// its own body. With the sheet clicked the keys go to the frame's document, never to the app's
// window where Shift+F / Shift+M listen: the frame hands over Shift+letter outside its fields.
// Only a real press counts (`isTrusted`) and the author's own handler may keep it
// (`preventDefault`); the host's contract takes one letter and nothing else.
function installFrameShiftKeys(scope: SheetFrameKeyScope, send: (message: object) => void): void {
  const fields = 'input, textarea, select';

  function inField(target: unknown): boolean {
    const element = target as { closest?: unknown; isContentEditable?: unknown } | null;
    if (typeof element !== 'object' || element === null) return false;
    if (element.isContentEditable === true) return true;
    if (typeof element.closest !== 'function') return false;
    return (element.closest as (selector: string) => unknown).call(element, fields) !== null;
  }

  function onlyShift(event: SheetFrameKeyEvent): boolean {
    return event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
  }

  // Caps Lock turns Shift+F into `f`.
  function isLetter(key: string): boolean {
    if (key.length !== 1) return false;
    return (key >= 'A' && key <= 'Z') || (key >= 'a' && key <= 'z');
  }

  scope.addEventListener('keydown', (event) => {
    if (!event.isTrusted || event.repeat || event.defaultPrevented || !onlyShift(event)) return;
    if (!isLetter(event.key) || inField(event.target)) return;
    send({ type: 'shortcut', key: event.key });
  });
}

/** The text of `installFrameShiftKeys`, for the bootstrap to embed and call. */
export const SHEET_FRAME_KEYS_SOURCE: string = installFrameShiftKeys.toString();
