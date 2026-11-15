// The shapes the frame's SDK takes and gives, kept apart from `sheet-bridge-bootstrap.ts`, whose
// body is serialized into the frame: types only, erased before it runs.

import type { SheetFrameLists } from './sheet-frame-bindings';

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

/** A piece the sheet sums to the room's tray (`dice.tray.add`). */
export interface SheetTrayPiece {
  readonly expression: string;
  readonly label?: string;
}

/** What `dice.tray.roll` resolves with (`sheetFrameTrayRollDto`, mirrored): each part labeled. */
export interface SheetFrameTrayRoll {
  readonly total: number;
  readonly parts: ReadonlyArray<SheetFrameRoll & { readonly label: string | null }>;
}

/** A saved roll of the viewer (`savedRollDto`, mirrored). */
export interface SheetFrameSavedRoll {
  readonly id: string;
  readonly name: string;
  readonly folderId: string | null;
  readonly parts: ReadonlyArray<{ readonly label: string | null; readonly expression: string }>;
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

/** One bar of the token as the frame gets it (a `tokenBarDto`, with more fields than these). */
export interface SheetFrameBar {
  readonly id: string;
  readonly label: string;
  readonly current: number;
  readonly max: number;
  readonly [field: string]: unknown;
}

/** The character that holds the sheet, as the last `state` had it. */
export interface SheetFrameCharacter {
  readonly name: string;
  readonly armorClass: number | null;
  readonly difficultyClass: number | null;
}

/** `window.lorkarium`, the only door from the author's code to the table. Every request settles
 *  when the host answers `result` (resolves) or `error` (rejects with `code` and `message`).
 *  `get`, `all` and `list` read copies of the last `state` and never ask the host. */
export interface LorkariumSdk {
  ready(): Promise<undefined>;
  onState(listener: (state: unknown) => void): () => void;
  readonly bars: {
    adjust(bar: string, change: SheetBarChange): Promise<undefined>;
    /** Every cost or none (`INSUFFICIENT_BAR`), from the current value only. */
    spend(costs: ReadonlyArray<{ bar: string; amount: number }>): Promise<undefined>;
    /** Creates on the holder a bar it lacks, full (permission `character:bars`); one already
     *  there under that label resolves with its id and `created: false`. */
    create(bar: {
      label: string;
      max: number;
      color?: string;
    }): Promise<{ barId: string; created: boolean }>;
    list(): SheetFrameBar[];
    get(bar: string): SheetFrameBar | undefined;
  };
  readonly dice: {
    /** Resolves with the roll once its dice settle on the table. */
    roll(request: SheetDiceRequest): Promise<SheetFrameRoll>;
    /** The room's "Montar rolagem" of who looks at the sheet: pieces summed, rolled together. */
    readonly tray: {
      add(piece: SheetTrayPiece): Promise<undefined>;
      /** Copies a saved roll of the viewer (permission `dice:saved`). */
      addSaved(savedRollId: string): Promise<undefined>;
      /** Rolls the whole tray with its "Quem vê" and mode; resolves once the dice settle. */
      roll(): Promise<SheetFrameTrayRoll>;
    };
    /** The viewer's saved rolls at the table (permission `dice:saved`). */
    readonly saved: { list(): Promise<SheetFrameSavedRoll[]> };
  };
  readonly values: {
    set(changes: Record<string, unknown>): Promise<undefined>;
    /** Replaces only the value at each path of keys (`null` removes it). */
    patch(patches: ReadonlyArray<{ path: string[]; value: unknown }>): Promise<undefined>;
    get(key: string): unknown;
    all(): Record<string, unknown>;
  };
  readonly character: {
    get(): SheetFrameCharacter | null;
    set(changes: { armorClass?: number; difficultyClass?: number }): Promise<undefined>;
    setImage(image: SheetImageInput): Promise<undefined>;
  };
  readonly assets: {
    upload(image: SheetImageInput): Promise<{ assetId: string }>;
    read(assetId: string): Promise<SheetFrameImage>;
  };
  /** The table's public documents (manifest permission `documents:read`): the same for every
   *  viewer, read on demand (nothing is pushed when a document changes). */
  readonly documents: {
    list(): Promise<SheetFrameDocument[]>;
    tabs(documentId: string): Promise<SheetFrameDocumentTab[]>;
    readTab(documentId: string, tabId: string): Promise<SheetFrameDocumentTabContent>;
  };
  /** Clean html of a rich text before showing it: formatting stays, anything that runs or loads
   *  goes. Synchronous, no host request. */
  readonly html: { sanitize(html: string): string };
  /** Repeated sections under a value path, each item at a stable 8-character id. */
  readonly lists: SheetFrameLists;
}
