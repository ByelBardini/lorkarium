/**
 * Deep equality of two JSON values, ignoring object key order (Postgres `jsonb` reorders keys,
 * so a saved document comes back equal but stringifies differently).
 * Example: sameJsonValue({ a: 1, b: [2] }, { b: [2], a: 1 }) === true.
 */
export function sameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) return sameJsonArray(left, right);
  if (!isJsonObject(left) || !isJsonObject(right)) return false;
  const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined);
  const rightKeys = Object.keys(right).filter((key) => right[key] !== undefined);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => sameJsonValue(left[key], right[key]));
}

function sameJsonArray(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((item, index) => sameJsonValue(item, right[index]));
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
