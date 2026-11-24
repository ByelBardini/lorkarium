/** The most JSON (UTF-8 bytes) of `lorkarium.view.set`. Mirrors the contract's
 *  `SHEET_VIEW_MAX_BYTES` by hand (the frame imports nothing); the spec holds them equal. */
export const SHEET_FRAME_VIEW_MAX_BYTES = 4096;

/** `lorkarium.view` as the bootstrap drives it: `get`/`set` for the author, `adopt` for the view
 *  each `state` brings. */
export interface SheetFrameView {
  get(): unknown;
  set(value: unknown): Promise<undefined>;
  adopt(view: unknown): void;
}

/** Builds the view over `send` (the SDK's request to the host, answered `result` or `error`). */
export type SheetFrameViewFactory = (
  maxBytes: number,
  send: (body: object, type: string) => Promise<undefined>,
) => SheetFrameView;

// Serialized by `toString` into the srcdoc, like the bootstrap: it may reference nothing outside
// its own body. Out of the bootstrap only so that file stays under 500 lines. The view is who
// looks's, kept by the app (the frame remounts on every tab/window move): once this frame set it,
// its own value wins over a `state` sent before the host had it.
function createFrameView(
  maxBytes: number,
  send: (body: object, type: string) => Promise<undefined>,
): SheetFrameView {
  const parse = JSON.parse;
  const stringify = JSON.stringify;
  const isFiniteNumber = Number.isFinite;
  let kept: string | null = null;
  let setHere = false;

  function jsonOnly(key: string, value: unknown): unknown {
    if (typeof value === 'function')
      throw new TypeError(`lorkarium: view ${key || 'value'} is a function; expected JSON`);
    if (typeof value === 'number' && !isFiniteNumber(value))
      throw new TypeError(
        `lorkarium: view ${key || 'value'} is ${value}; expected a finite number`,
      );
    return value;
  }

  function utf8Bytes(text: string): number {
    let bytes = 0;
    for (const character of text) {
      const code = character.codePointAt(0) ?? 0;
      bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
    }
    return bytes;
  }

  function textOf(value: unknown): string {
    const text = stringify(value, jsonOnly);
    if (typeof text !== 'string')
      throw new TypeError(`lorkarium: view is ${typeof value}; expected a JSON value`);
    const bytes = utf8Bytes(text);
    if (bytes > maxBytes)
      throw new TypeError(
        `lorkarium: view has ${bytes} bytes of JSON; expected at most ${maxBytes}`,
      );
    return text;
  }

  function get(): unknown {
    return kept === null ? null : parse(kept);
  }

  // Shown at once; a refusal from the host puts back the view it still keeps.
  function set(value: unknown): Promise<undefined> {
    let text: string;
    try {
      text = textOf(value);
    } catch (error) {
      return Promise.reject(error);
    }
    const before = kept;
    const next = text === 'null' ? null : text;
    kept = next;
    setHere = true;
    return send({ value: parse(text) }, 'view.set').catch((error: unknown) => {
      if (kept === next) kept = before;
      throw error;
    });
  }

  function adopt(view: unknown): void {
    if (setHere) return;
    kept = view === null || view === undefined ? null : stringify(view);
  }

  return { get, set, adopt };
}

/** The text of `createFrameView`, for the bootstrap to embed and call. */
export const SHEET_FRAME_VIEW_SOURCE: string = createFrameView.toString();
