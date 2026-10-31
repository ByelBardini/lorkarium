import {
  createThreeDiceRenderer,
  type DiceLook,
  type DiceRenderer,
} from '@lorkarium/dice-renderer';
import { diceNumberColorOf } from '@/lib/dice-number-color';
import { diceTextureUrlOf } from '@/lib/dice-texture-url';
import { MEMBER_COLOR_HEX } from '@/lib/member-color';

/** The app's dice: the profile palette, the contrast rule of the numbers and the uploaded
 *  textures under `/api`. */
export const APP_DICE_LOOK: DiceLook = {
  colorHex: MEMBER_COLOR_HEX,
  numberColorOf: diceNumberColorOf,
  textureUrlOf: diceTextureUrlOf,
};

/** The 3D dice of the app over the whole window. Imported by `import()` only, so the
 *  renderer and three.js stay out of the first bundle.
 *
 *  Example: `import('@/features/dice/app-dice-renderer').then((m) => m.createAppDiceRenderer())` */
export function createAppDiceRenderer(): Promise<DiceRenderer> {
  return createThreeDiceRenderer({ look: APP_DICE_LOOK });
}
