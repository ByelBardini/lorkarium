import type { DiceRolledDto, DiceRolledSecretlyDto } from '@lorkarium/contracts';
import { DICE_QUATERNION_SCALE } from '@lorkarium/game-core';
import type {
  DicePhysicsPort,
  DiceThrowRequest,
  DiceThrowResult,
} from '../../src/modules/dice/dice-physics.port';
import type { DicePublisherPort } from '../../src/modules/dice/dice-publisher.port';
import type { DiceRandomPort } from '../../src/modules/dice/dice-random.port';
import type { DiceAudience } from '../../src/modules/dice/dice-roll.bo';

// ---------------------------------------------------------------------------------------------
// Random sources
// ---------------------------------------------------------------------------------------------

const UINT32 = 2 ** 32;

/** A repeatable `DiceRandomPort` over mulberry32: the same seed gives the same numbers, so a
 *  physics throw fed by it gives the same trajectory. `draws` counts every `unit()` taken.
 *
 *  Example: `new CannonDicePhysics(new SeededDiceRandomFake(7))` */
export class SeededDiceRandomFake implements DiceRandomPort {
  draws = 0;
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  unit(): number {
    this.draws += 1;
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let mixed = this.state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32;
  }

  face(sides: number): number {
    return Math.floor(this.unit() * sides) + 1;
  }
}

/** The `randomInt` stand-in of `CryptoDiceRandom`: answers `value` (or `exclusiveMax - 1` when
 *  `value` is `'max'`) and keeps every bound asked.
 *
 *  Example: `new CryptoDiceRandom(new FixedIntSourceFake(5).next).face(6) // 6` */
export class FixedIntSourceFake {
  readonly bounds: number[] = [];

  constructor(private readonly value: number | 'max') {}

  readonly next = (exclusiveMax: number): number => {
    this.bounds.push(exclusiveMax);
    return this.value === 'max' ? exclusiveMax - 1 : this.value;
  };
}

// ---------------------------------------------------------------------------------------------
// Roll service
// ---------------------------------------------------------------------------------------------

/** One pose at the origin, upright: the smallest valid `frames`. */
export const RESTING_FRAMES: readonly number[] = [0, 0, 0, 0, 0, 0, DICE_QUATERNION_SCALE];

/** A `DicePhysicsPort` that lands the queued `values` in order (one per modeled die, `1` once the
 *  queue is empty) and settles each die `settleAfterMs` after its wave starts. `throws` keeps
 *  every request.
 *
 *  Example: `new DicePhysicsFake([17]).throw({ kinds: ['d20'], aspect: 1, startMs: 0 })` */
export class DicePhysicsFake implements DicePhysicsPort {
  readonly throws: DiceThrowRequest[] = [];

  constructor(
    private readonly values: number[] = [],
    private readonly settleAfterMs = 1500,
  ) {}

  throw(request: DiceThrowRequest): DiceThrowResult {
    this.throws.push(request);
    const settleMs = request.startMs + this.settleAfterMs;
    const models = request.kinds.map((kind) => {
      const value = this.values.shift() ?? 1;
      return {
        kind,
        startMs: request.startMs,
        settleMs,
        frames: RESTING_FRAMES,
        value,
        rethrows: 0,
      };
    });
    return { models };
  }
}

/** A `DiceRandomPort` that answers the queued `faces` in order (`1` once empty); `asked` keeps
 *  the sides of every face drawn.
 *
 *  Example: `new DiceRandomFake([4]).face(7) // 4` */
export class DiceRandomFake implements DiceRandomPort {
  readonly asked: number[] = [];

  constructor(private readonly faces: number[] = []) {}

  face(sides: number): number {
    this.asked.push(sides);
    return this.faces.shift() ?? 1;
  }

  unit(): number {
    return 0.5;
  }
}

/** Every roll published, with its audience; `journal` reads `publish:full:table`,
 *  `publish:full:masters+<userIds>` and `publish:secret`.
 *
 *  Example: `expect(publisher.journal).toEqual([`publish:full:masters+${BIA_ID}`, 'publish:secret'])` */
export class DicePublisherFake implements DicePublisherPort {
  readonly journal: string[] = [];
  readonly full: DiceRolledDto[] = [];
  readonly secret: DiceRolledSecretlyDto[] = [];

  rolled(event: DiceRolledDto, audience: DiceAudience): void {
    this.full.push(event);
    const who = audience.kind === 'table' ? 'table' : ['masters', ...audience.userIds].join('+');
    this.journal.push(`publish:full:${who}`);
  }

  rolledSecretly(notice: DiceRolledSecretlyDto): void {
    this.secret.push(notice);
    this.journal.push('publish:secret');
  }
}
