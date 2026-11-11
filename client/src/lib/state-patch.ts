/** The patch when it changes something of `state` (one field of another identity), `null`
 *  when every field already holds that very value: a store sets only a patch that is not `null`,
 *  so an event that changes nothing notifies nobody (an empty `set({})` would notify everyone).
 *
 *  Example: `const patch = changedPatchOf(get(), { readOnly }); if (patch) set(patch)` */
export function changedPatchOf<S extends object>(state: S, patch: Partial<S>): Partial<S> | null {
  const keys = Object.keys(patch) as (keyof S)[];
  return keys.some((key) => !Object.is(state[key], patch[key])) ? patch : null;
}
