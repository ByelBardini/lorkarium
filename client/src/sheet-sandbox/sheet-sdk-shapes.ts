// The shapes the frame's SDK takes and gives, kept apart from `sheet-bridge-bootstrap.ts`, whose
// body is serialized into the frame: types only, erased before it runs.

// Mirrors barChangeDto by hand: the frame's code, typed from here, imports nothing.
export type SheetBarChange =
  | { readonly op: 'add'; readonly amount: number }
  | { readonly op: 'set' | 'max' | 'temp'; readonly value: number };

export interface SheetDiceRequest {
  readonly expression: string;
  readonly label?: string;
  readonly visibility?: string;
}

/** One die of a sheet's roll (`sheetFrameRolledDieDto`, mirrored by hand). */
export interface SheetFrameRolledDie {
  readonly sides: number;
  readonly value: number;
  /** `kept` and `exploded` count in the total; `dropped` and `rerolled` do not. */
  readonly status: string;
  /** Only on a die counted against a target (`>=`, `<=`). */
  readonly success?: boolean;
}

/** What `dice.roll` resolves with once the dice settle (`sheetFrameRollDto`, mirrored). */
export interface SheetFrameRoll {
  readonly expression: string;
  readonly total: number;
  readonly dice: readonly SheetFrameRolledDie[];
}

/** A `File` or `Blob` (its own `type`), or bytes with their type. */
export type SheetImageInput =
  | { readonly type: string; arrayBuffer(): Promise<ArrayBuffer> }
  | { readonly type: string; readonly bytes: ArrayBuffer | ArrayBufferView };

/** An image read through the host: the author makes a `blob:` URL of it. */
export interface SheetFrameImage {
  readonly type: string;
  readonly bytes: ArrayBuffer;
}

/** A public document of the table (`sheetFrameDocumentDto`, mirrored): its folders root first. */
export interface SheetFrameDocument {
  readonly id: string;
  readonly name: string;
  readonly folderPath: string[];
}

/** A tab of a public document, in the document's order. */
export interface SheetFrameDocumentTab {
  readonly id: string;
  readonly name: string;
}

/** One tab's body: the Tiptap tree (`{ type: 'doc', content: [...] }`) and its plain text. */
export interface SheetFrameDocumentTabContent extends SheetFrameDocumentTab {
  readonly content: { readonly type: 'doc'; readonly content: unknown[] };
  readonly text: string;
}
