import type { SheetDiceRequest } from './sheet-bridge-bootstrap';

/** An element of the frame's page, reduced to what the declarative binding reads and writes. */
export interface SheetBoundElement {
  readonly tagName: string;
  readonly type?: string;
  value?: string;
  checked?: boolean;
  innerHTML: string;
  textContent: string | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  contains(other: unknown): boolean;
  closest(selector: string): SheetBoundElement | null;
  querySelectorAll(selector: string): ArrayLike<SheetBoundElement>;
}

/** The frame's `document` as the binding sees it. Structural, so the e2e needs no DOM types. */
export interface SheetBindingDocument {
  readonly documentElement: SheetBoundElement;
  readonly activeElement: unknown;
  querySelectorAll(selector: string): ArrayLike<SheetBoundElement>;
  addEventListener(
    type: string,
    listener: (event: { target: unknown }) => void,
    capture: boolean,
  ): void;
}

/** The frame's `MutationObserver` class: the binding only watches nodes being added. */
export type SheetBindingObserverClass = new (
  callback: (records: ArrayLike<{ readonly addedNodes: ArrayLike<unknown> }>) => void,
) => { observe(target: unknown, options: { childList: boolean; subtree: boolean }): void };

/** What of the frame's `window` the binding reads. A scope with no `document` (the unit fakes of
 *  the SDK) gets the lists and no page binding. */
export interface SheetBindingScope {
  readonly document?: SheetBindingDocument;
  readonly MutationObserver?: SheetBindingObserverClass;
  readonly crypto?: { getRandomValues(bytes: Uint8Array): Uint8Array };
}

/** The SDK's own pieces the binding drives, handed over by the bootstrap. */
export interface SheetBindingParts {
  onState(listener: (state: unknown) => void): () => void;
  patch(patches: Array<{ path: string[]; value: unknown }>): Promise<undefined>;
  roll(request: SheetDiceRequest): Promise<undefined>;
  sanitize(html: unknown): string;
  report(...args: unknown[]): void;
}

/** One item of a repeated list: its stable id and a copy of what it holds. */
export interface SheetListItem {
  readonly id: string;
  readonly value: unknown;
}

/** `lorkarium.lists`: repeated sections addressed by a stable id, never by position. */
export interface SheetFrameLists {
  add(list: string, item?: Record<string, unknown>): Promise<string>;
  remove(list: string, id: string): Promise<undefined>;
  items(list: string): SheetListItem[];
}

export type SheetFrameBindingsFactory = (
  scope: SheetBindingScope,
  parts: SheetBindingParts,
) => { lists: SheetFrameLists };

type BindingKind = 'check' | 'radio' | 'number' | 'text' | 'rich' | 'display';

// Serialized by `toString` into the srcdoc, like the bootstrap: it may reference nothing outside
// its own body. Out of the bootstrap only so that file stays under 500 lines. The path rule
// mirrors the `sheetValuePathPatchesDto` keys by hand (this file imports nothing); the host and
// the server check again. Writes go through the SDK's `values.patch`, so the frame never gets a
// channel of its own. `document`, the observer and the random source are captured when the
// bootstrap calls it, before the author's code.
function createFrameBindings(
  scope: SheetBindingScope,
  parts: SheetBindingParts,
): { lists: SheetFrameLists } {
  const parse = JSON.parse;
  const stringify = JSON.stringify;
  const hasOwn = Object.prototype.hasOwnProperty;
  const ownKeys = Object.keys;
  const isFiniteNumber = Number.isFinite;
  const isInteger = Number.isInteger;
  const { abs, floor, random } = Math;
  const keyPattern = /^[A-Za-z0-9_-]{1,64}$/;
  const forbiddenKeys = ['__proto__', 'constructor', 'prototype'];
  const idAlphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const cryptoSource = scope.crypto;
  const doc = scope.document;
  const Observer = scope.MutationObserver;
  const reported = new WeakSet<object>();
  const lastSent = new WeakMap<object, string>();
  let values: unknown = null;
  let canEdit = false;
  let known = false;

  function isKey(key: unknown): key is string {
    return typeof key === 'string' && keyPattern.test(key) && forbiddenKeys.indexOf(key) < 0;
  }

  function keysOf(path: unknown): string[] | null {
    if (typeof path !== 'string') return null;
    const keys = path.split('.');
    if (keys.length > 8) return null;
    for (let index = 0; index < keys.length; index += 1) if (!isKey(keys[index])) return null;
    return keys;
  }

  function pathError(what: string, path: unknown): TypeError {
    return new TypeError(
      `lorkarium: ${what} "${String(path)}" is not a value path; expected 1 to 8 keys of A-Z a-z 0-9 _ - joined by "."`,
    );
  }

  function valueAt(keys: readonly string[]): unknown {
    let node = values;
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index]!;
      if (typeof node !== 'object' || node === null || !hasOwn.call(node, key)) return undefined;
      node = (node as Record<string, unknown>)[key];
    }
    return node;
  }

  function tagOf(element: SheetBoundElement): string {
    return `<${String(element.tagName).toLowerCase()}>`;
  }

  function boundKeys(element: SheetBoundElement): string[] | null {
    const path = element.getAttribute('data-lk');
    const keys = keysOf(path);
    if (keys !== null || reported.has(element)) return keys;
    reported.add(element);
    parts.report(
      `lorkarium: data-lk "${String(path)}" on ${tagOf(element)} is not a value path; expected 1 to 8 keys of A-Z a-z 0-9 _ - joined by "."`,
    );
    return null;
  }

  function kindOf(element: SheetBoundElement): BindingKind {
    const tag = String(element.tagName).toLowerCase();
    const type = String(element.type || '').toLowerCase();
    if (tag === 'input' && type === 'checkbox') return 'check';
    if (tag === 'input' && type === 'radio') return 'radio';
    if (tag === 'input' && (type === 'number' || type === 'range')) return 'number';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'text';
    const editable = element.getAttribute('contenteditable');
    if (editable !== null && editable.toLowerCase() !== 'false') return 'rich';
    return 'display';
  }

  function textOf(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
  }

  function show(element: SheetBoundElement, value: unknown): void {
    const kind = kindOf(element);
    if (kind === 'check') element.checked = value === true;
    else if (kind === 'radio')
      element.checked = textOf(value) !== '' && textOf(value) === element.value;
    else if (kind === 'number' || kind === 'text') element.value = textOf(value);
    else if (kind === 'rich')
      element.innerHTML = parts.sanitize(typeof value === 'string' ? value : '');
    else element.textContent = textOf(value);
  }

  function isFocused(element: SheetBoundElement): boolean {
    const active = doc ? doc.activeElement : null;
    return (
      active !== null && active !== undefined && (element === active || element.contains(active))
    );
  }

  function fill(element: SheetBoundElement): void {
    const keys = boundKeys(element);
    if (keys === null || isFocused(element)) return;
    lastSent.delete(element);
    show(element, valueAt(keys));
  }

  function fillTree(node: unknown): void {
    const element = node as SheetBoundElement;
    if (!known || typeof element.querySelectorAll !== 'function') return;
    if (element.hasAttribute('data-lk')) fill(element);
    const inner = element.querySelectorAll('[data-lk]');
    for (let index = 0; index < inner.length; index += 1) fill(inner[index]!);
  }

  // `undefined` = nothing to write (a radio being unchecked, a number still being typed).
  function written(element: SheetBoundElement): unknown {
    const kind = kindOf(element);
    if (kind === 'check') return element.checked === true;
    if (kind === 'radio') return element.checked === true ? element.value : undefined;
    if (kind === 'text') return String(element.value);
    if (kind === 'rich') return parts.sanitize(element.innerHTML);
    if (kind !== 'number') return undefined;
    if (element.value === '') return null;
    const number = Number(element.value);
    return isFiniteNumber(number) ? number : undefined;
  }

  function save(element: SheetBoundElement, keys: string[], value: unknown): void {
    const text = stringify(value);
    if (lastSent.get(element) === text) return;
    lastSent.set(element, text);
    parts.patch([{ path: keys, value }]).catch((error: unknown) => {
      parts.report(`lorkarium: data-lk "${keys.join('.')}" was not saved`, error);
    });
  }

  function onEdit(event: { target: unknown }): void {
    const element = event.target as SheetBoundElement | null;
    if (!canEdit || element === null || typeof element.getAttribute !== 'function') return;
    if (!element.hasAttribute('data-lk')) return;
    const keys = boundKeys(element);
    const value = keys === null ? undefined : written(element);
    if (keys !== null && value !== undefined) save(element, keys, value);
  }

  function wholeNumberOf(value: unknown): number | null {
    if (typeof value === 'number') return isInteger(value) ? value : null;
    if (typeof value === 'string' && /^\s*-?\d+\s*$/.test(value)) return Number(value);
    return null;
  }

  // `+@a` with a = -2 reads `-2`: the dice notation takes one sign per term. A bare `@path` stops
  // at `-` (`@mod-@pen` is a subtraction); a key with `-` goes in braces, `@{golpe-duplo.dano}`.
  function resolvedRoll(expression: string): { text: string; missing: string | null } {
    let missing: string | null = null;
    const text = expression.replace(
      /([+-]?)\s*@(?:\{([^}]*)\}|([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*))/g,
      (_all, sign: string, braced: string | undefined, bare: string | undefined) => {
        const path = braced ?? bare ?? '';
        const keys = keysOf(path);
        const found = keys === null ? null : wholeNumberOf(valueAt(keys));
        if (found === null) missing = missing ?? path;
        const signed = (sign === '-' ? -1 : 1) * (found ?? 0);
        const digits = `${abs(signed)}`;
        return signed < 0 ? `-${digits}` : sign === '' ? digits : `+${digits}`;
      },
    );
    return { text, missing };
  }

  function onClick(event: { target: unknown }): void {
    const target = event.target as SheetBoundElement | null;
    if (target === null || typeof target.closest !== 'function') return;
    const button = target.closest('[data-lk-roll]');
    if (button === null) return;
    const expression = String(button.getAttribute('data-lk-roll'));
    const { text, missing } = resolvedRoll(expression);
    if (missing !== null)
      return parts.report(
        `lorkarium: data-lk-roll "${expression}" needs @${missing}, which is not a whole number in the values`,
      );
    const label = button.getAttribute('data-lk-label');
    const visibility = button.getAttribute('data-lk-visibility');
    parts
      .roll({ expression: text, label: label ?? undefined, visibility: visibility ?? undefined })
      .catch((error: unknown) =>
        parts.report(`lorkarium: data-lk-roll "${expression}" did not roll`, error),
      );
  }

  function onBindingState(state: unknown): void {
    const read = state as { values?: unknown; canEdit?: unknown };
    values = read.values;
    canEdit = read.canEdit === true;
    known = true;
    if (doc) fillTree(doc.documentElement);
  }

  function randomId(): string {
    const bytes = new Uint8Array(8);
    if (cryptoSource) cryptoSource.getRandomValues(bytes);
    else for (let index = 0; index < 8; index += 1) bytes[index] = floor(random() * 256);
    let id = '';
    for (let index = 0; index < 8; index += 1) id += idAlphabet[bytes[index]! % 36];
    return id;
  }

  function listAt(keys: readonly string[]): Record<string, unknown> {
    const list = valueAt(keys);
    return typeof list === 'object' && list !== null && !Array.isArray(list)
      ? (list as Record<string, unknown>)
      : {};
  }

  function freshId(keys: readonly string[]): string {
    const taken = listAt(keys);
    let id = randomId();
    for (let tries = 0; tries < 8 && hasOwn.call(taken, id); tries += 1) id = randomId();
    return id;
  }

  function add(list: string, item?: Record<string, unknown>): Promise<string> {
    const keys = keysOf(list);
    if (keys === null || keys.length > 7) return Promise.reject(pathError('list', list));
    const value = item === undefined ? {} : item;
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return Promise.reject(
        new TypeError(
          `lorkarium: list item is ${value === null ? 'null' : typeof value}; expected a plain object`,
        ),
      );
    const id = freshId(keys);
    return parts.patch([{ path: keys.concat(id), value }]).then(() => id);
  }

  function remove(list: string, id: string): Promise<undefined> {
    const keys = keysOf(list);
    if (keys === null || keys.length > 7) return Promise.reject(pathError('list', list));
    if (!isKey(id))
      return Promise.reject(
        new TypeError(`lorkarium: list item id "${String(id)}" is not a value key`),
      );
    return parts.patch([{ path: keys.concat(id), value: null }]);
  }

  function items(list: string): SheetListItem[] {
    const keys = keysOf(list);
    if (keys === null) throw pathError('list', list);
    const found = listAt(keys);
    return ownKeys(found).map((id) => ({ id, value: parse(stringify(found[id])) as unknown }));
  }

  parts.onState(onBindingState);
  if (doc && Observer) {
    doc.addEventListener('input', onEdit, true);
    doc.addEventListener('change', onEdit, true);
    doc.addEventListener('click', onClick, true);
    new Observer((records) => {
      for (let index = 0; index < records.length; index += 1) {
        const added = records[index]!.addedNodes;
        for (let at = 0; at < added.length; at += 1) fillTree(added[at]);
      }
    }).observe(doc.documentElement, { childList: true, subtree: true });
  }
  return { lists: { add, remove, items } };
}

/** The text of `createFrameBindings`, for the bootstrap to embed and call. */
export const SHEET_FRAME_BINDINGS_SOURCE: string = createFrameBindings.toString();
