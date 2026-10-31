import type { DiceLook } from '@lorkarium/dice-renderer';
import type { LoadedDice } from '@/scripts/dice-act';

// The app's ember die (client/src/lib/member-color.ts, dice-number-color.ts): the same hex and the
// dark numbers the app picks for it by contrast, so the landing's d20 is the table's d20.
// The recorded throws rest in the central 40 % of the box (server/src/record-dice-throws.ts):
// zooming in 1.8× keeps them in the stage while the d20 is large enough to read.
const LANDING_DICE_ZOOM = 1.8;

const LANDING_DICE_LOOK: DiceLook = {
  colorHex: { ember: 0xe0704f },
  numberColorOf: () => '#1a1a1a',
  textureUrlOf: (textureId) => {
    throw new Error(`The landing has no uploaded dice textures, got "${textureId}"`);
  },
};

/**
 * Loads the dice renderer, three.js and the recorded throws on demand into the act V stage:
 * their own chunks, out of the landing's first JavaScript. Rejects where WebGL is not available.
 * Example: `startDiceAct(document, { loadDice: loadLandingDice, … })`
 */
export async function loadLandingDice(stage: HTMLElement): Promise<LoadedDice> {
  const [{ createThreeDiceRenderer }, { recordedThrowsOf }, recording] = await Promise.all([
    import('@lorkarium/dice-renderer'),
    import('@/lib/recorded-throws'),
    import('@/assets/dice/throws.json'),
  ]);
  const renderer = await createThreeDiceRenderer({
    look: LANDING_DICE_LOOK,
    container: stage,
    zoom: LANDING_DICE_ZOOM,
  });
  return { renderer, throws: recordedThrowsOf(recording.default) };
}
