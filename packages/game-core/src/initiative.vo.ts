/** Initiative goes from −999 to 999 (any system's roll fits); `null` = not rolled yet. */
export const INITIATIVE_LIMIT = 999;

export type Initiative = number | null;

/** Validates an initiative: a whole number within ±999, or `null`.
 *
 *  Example: `initiative(18) // 18` */
export function initiative(value: Initiative): Initiative {
  if (value === null) return null;
  if (Number.isInteger(value) && Math.abs(value) <= INITIATIVE_LIMIT) return value;
  throw new RangeError(
    `Initiative ${String(value)} is invalid: expected a whole number in −${INITIATIVE_LIMIT}…${INITIATIVE_LIMIT}.`,
  );
}
