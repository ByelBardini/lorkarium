import { z } from 'zod';
import { utf8Length } from '../utf8-length';

export const SHEET_VALUES_MAX_BYTES = 256 * 1024;
export const SHEET_VALUE_KEY_MAX_LENGTH = 64;
export const SHEET_VALUES_MAX_DEPTH = 8;
export const SHEET_VALUES_MAX_KEYS = 1000;
// These names reach the prototype chain when a client merges values into a plain object.
const FORBIDDEN_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype'];
const KEY_PATTERN = new RegExp(`^[A-Za-z0-9_-]{1,${SHEET_VALUE_KEY_MAX_LENGTH}}$`);

export type SheetValueDto =
  string | number | boolean | null | SheetValueDto[] | { [key: string]: SheetValueDto };
export type SheetValuesDto = Record<string, SheetValueDto>;

interface PendingValue {
  value: unknown;
  depth: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function keyProblem(key: string): string | null {
  if (KEY_PATTERN.test(key) && !FORBIDDEN_KEYS.includes(key)) return null;
  return `Invalid sheet value key ${JSON.stringify(key)}; expected 1-${SHEET_VALUE_KEY_MAX_LENGTH} of A-Z a-z 0-9 _ - and not ${FORBIDDEN_KEYS.join(', ')}`;
}

function leafProblem(value: unknown): string | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return null;
  if (typeof value === 'number')
    return `Invalid sheet value ${String(value)}; expected a finite number`;
  return `Invalid sheet value of type ${typeof value}; expected string, finite number, boolean, null, array or object`;
}

function pushChildren(
  entry: PendingValue,
  keys: { count: number },
  pending: PendingValue[],
): string | null {
  const { value, depth } = entry;
  if (Array.isArray(value)) {
    if (value.length > SHEET_VALUES_MAX_BYTES) return 'Sheet values byte budget exceeded';
    for (const item of value as unknown[]) pending.push({ value: item, depth: depth + 1 });
    return null;
  }
  if (!isPlainObject(value)) return 'Expected sheet values made of plain objects and arrays';
  for (const key of Object.keys(value)) {
    const problem = keyProblem(key);
    if (problem) return problem;
    if (++keys.count > SHEET_VALUES_MAX_KEYS)
      return `Sheet values have more than ${SHEET_VALUES_MAX_KEYS} keys; expected at most ${SHEET_VALUES_MAX_KEYS}`;
    pending.push({ value: value[key], depth: depth + 1 });
  }
  return null;
}

function valuesProblem(input: unknown): string | null {
  if (!isPlainObject(input)) return 'Expected sheet values to be an object of keys';
  const pending: PendingValue[] = [{ value: input, depth: 0 }];
  const keys = { count: 0 };
  let visited = 0;
  while (pending.length > 0) {
    const entry = pending.pop();
    if (!entry) break;
    // Every JSON value takes at least one byte, so more values than bytes is over the budget
    // before anything is serialized.
    if (++visited > SHEET_VALUES_MAX_BYTES) return 'Sheet values byte budget exceeded';
    if (entry.depth > SHEET_VALUES_MAX_DEPTH)
      return `Sheet value nested ${entry.depth} levels deep; expected at most ${SHEET_VALUES_MAX_DEPTH}`;
    if (typeof entry.value !== 'object' || entry.value === null) {
      const problem = leafProblem(entry.value);
      if (problem) return problem;
      continue;
    }
    const problem = pushChildren(entry, keys, pending);
    if (problem) return problem;
  }
  return null;
}

function parsedValues(input: unknown, context: z.RefinementCtx): SheetValuesDto {
  const problem = valuesProblem(input);
  if (problem) {
    context.addIssue({ code: 'custom', message: problem });
    return z.NEVER;
  }
  const json = JSON.stringify(input);
  if (utf8Length(json) > SHEET_VALUES_MAX_BYTES) {
    context.addIssue({
      code: 'custom',
      message: `Sheet values exceed ${SHEET_VALUES_MAX_BYTES} bytes of JSON`,
    });
    return z.NEVER;
  }
  return JSON.parse(json) as SheetValuesDto;
}

/** The values a sheet stores, checked by an iterative walk (keys, depth, count) before being
 *  serialized; the result is a fresh copy with no reference to the input.
 *
 *  Example: `sheetValuesDto.parse({ forca: 16, pericias: { furtividade: true } })` */
export const sheetValuesDto = z.unknown().transform(parsedValues);

/** The changed keys of `PATCH …/sheets/:sheetId/values`: each key replaces the stored one whole,
 *  `null` removes it; at least one key, under the same budget as the stored values.
 *
 *  Example: `sheetValuesPatchDto.parse({ forca: 16, notas: null })` */
export const sheetValuesPatchDto = sheetValuesDto.refine(
  (changes) => Object.keys(changes).length > 0,
  'changes is empty; expected at least one sheet value key',
);

/** Body of `PATCH /campaigns/:campaignId/sheets/:sheetId/values`: no `expectedVersion`, the last
 *  write wins per key (like the bars); `actionId` makes a retry idempotent.
 *
 *  Example: `updateSheetValuesRequestDto.parse({ actionId, changes: { forca: 16 } })` */
export const updateSheetValuesRequestDto = z.strictObject({
  actionId: z.uuid(),
  changes: sheetValuesPatchDto,
});
export type UpdateSheetValuesRequestDto = z.infer<typeof updateSheetValuesRequestDto>;
