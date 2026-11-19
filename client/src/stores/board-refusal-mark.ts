import type { BoardCommandFailure } from '@/services/board-command-sender';

/** The last refusal of the server for this viewer: its sentence and a number that grows with
 *  each one, so the same sentence twice still reads as a new refusal (the balloon by the cursor). */
export type BoardRefusal = Readonly<{ text: string; seq: number }>;

type RefusalDescriber = Readonly<{ describeRefusal: (failure: BoardCommandFailure) => string }>;

type RefusalState = Readonly<{ refusal: BoardRefusal | null }>;

/** The same deps whose `describeRefusal` also records the refusal in the store: every command
 *  flow that says why the server refused goes through it.
 *
 *  Example: `const deps = markingRefusals(given, set, get)` */
export function markingRefusals<Deps extends RefusalDescriber>(
  given: Deps,
  set: (patch: RefusalState) => void,
  get: () => RefusalState,
): Deps {
  const describeRefusal = (failure: BoardCommandFailure): string => {
    const text = given.describeRefusal(failure);
    set({ refusal: { text, seq: (get().refusal?.seq ?? 0) + 1 } });
    return text;
  };
  return { ...given, describeRefusal };
}
