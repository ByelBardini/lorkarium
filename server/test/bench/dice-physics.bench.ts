import { DIE_KINDS, type DieKind } from '@lorkarium/game-core';
import { test } from 'vitest';
import { CannonDicePhysics } from '../../src/infrastructure/dice-physics/cannon-dice-physics';
import { SeededDiceRandomFake } from '../support/dice-fakes';

// The CPU of the heaviest wave a roll sends to the physics (20 modeled dice, docs/context/dice/fisica.md):
// every kind in turn, so the slower d4 and d12 weigh as much as in a mixed roll.
const TWENTY_MIXED: DieKind[] = Array.from(
  { length: 20 },
  (_, index) => DIE_KINDS[index % DIE_KINDS.length] ?? 'd6',
);
const TWENTY_D20: DieKind[] = Array.from({ length: 20 }, () => 'd20');

test('a throw of 20 dice', async ({ bench }) => {
  const physics = new CannonDicePhysics(new SeededDiceRandomFake(3));
  await bench.compare(
    bench('20 mixed dice', () =>
      physics.throw({ kinds: TWENTY_MIXED, aspect: 16 / 9, startMs: 0 }),
    ),
    bench('20 d20', () => physics.throw({ kinds: TWENTY_D20, aspect: 16 / 9, startMs: 0 })),
  );
});
