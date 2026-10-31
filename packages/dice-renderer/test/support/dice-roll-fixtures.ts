import type { DiceAppearanceDto } from '@lorkarium/contracts';
import type { DiceRendererRoll } from '../../src/dice-renderer';
import type { DiceLook } from '../../src/three-dice-meshes';

export const EMBER_HEX = 0xe0704f;
export const ROSE_HEX = 0xe58fb4;

/** The host's palette as the specs see it: two profile colors, white numbers, textures under
 *  `/textures/`. */
export const TEST_DICE_LOOK: DiceLook = {
  colorHex: { ember: EMBER_HEX, rose: ROSE_HEX },
  numberColorOf: () => '#ffffff',
  textureUrlOf: (textureId) => `/textures/${textureId}`,
};

export const D20_ROLL_ID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

/** A d20 standing still: one pose (centre of the box, identity rotation). */
const RESTING_D20 = [0, 0, 0, 0, 0, 0, 32767];

const ROSE_DICE: DiceAppearanceDto = { color: 'rose', textureId: null, numberColor: null };

/** One rose d20 thrown from a 16:9 window that settles after 2.4 s.
 *
 *  Example: `renderer.show(d20Roll(rollIdOf(1)))` */
export function d20Roll(
  rollId: string = D20_ROLL_ID,
  appearance: DiceAppearanceDto = ROSE_DICE,
): DiceRendererRoll {
  return {
    rollId,
    appearance,
    throw: {
      aspect: 1.78,
      frameMs: 1000 / 30,
      models: [{ kind: 'd20', startMs: 0, settleMs: 2400, frames: RESTING_D20 }],
    },
  };
}

/** The `n`-th roll id of a long history (`n` from 0 to 9999). */
export function rollIdOf(n: number): string {
  return `7a1b2c3d-4e5f-4a6b-8c7d-${String(n).padStart(12, '0')}`;
}
