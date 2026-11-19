import { describe, expect, it } from 'vitest';
import type { BoardCommandFailure } from '@/services/board-command-sender';
import { markingRefusals, type BoardRefusal } from '@/stores/board-refusal-mark';

function harness() {
  let state: { refusal: BoardRefusal | null } = { refusal: null };
  const given = {
    describeRefusal: (failure: BoardCommandFailure) => `recusado: ${String(failure)}`,
  };
  const deps = markingRefusals(
    given,
    (patch) => (state = { ...state, ...patch }),
    () => state,
  );
  return { deps, refusal: () => state.refusal };
}

describe('markingRefusals', () => {
  it('describes the refusal as before and records it', () => {
    const { deps, refusal } = harness();

    expect(deps.describeRefusal('wall_blocked')).toBe('recusado: wall_blocked');
    expect(refusal()).toEqual({ text: 'recusado: wall_blocked', seq: 1 });
  });

  it('the same refusal twice is a new one each time', () => {
    const { deps, refusal } = harness();

    deps.describeRefusal('wall_blocked');
    deps.describeRefusal('wall_blocked');

    expect(refusal()).toEqual({ text: 'recusado: wall_blocked', seq: 2 });
  });
});
