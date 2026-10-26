/** One whole recorded roll inside `dice-rolls.wav`, a mono 32 kHz sprite with 50 ms of silence
 *  between rolls. `hitMs` is where its first hit sits in the clip: the sound starts that much
 *  before the dice land, so both hits fall together. Each tail fades out over 100 ms. */
export interface DiceRollSample {
  readonly startMs: number;
  readonly lengthMs: number;
  readonly hitMs: number;
}

/** Cut from free recordings the user picked (Pixabay licence: free use, no credit needed):
 *  `freesound_community-dice-95077` (the darkest), `u_qpfzpydtro-dice-142528` and the nine rolls
 *  of `u_ngsgp0r6zb-dice-roll-201898`, each normalized to the same peak, so the throw's strength
 *  alone sets the loudness. (`freesound_community-rpg-dice-rolling-95182` is the same recording
 *  as 95077 and adds nothing.) Whole rolls, never cut per hit: a sound per knock clipped itself. */
export const DICE_ROLL_SAMPLES: readonly DiceRollSample[] = [
  { startMs: 50, lengthMs: 737, hitMs: 45 },
  { startMs: 837, lengthMs: 1175, hitMs: 43 },
  { startMs: 2062, lengthMs: 975.03, hitMs: 41 },
  { startMs: 3087.03, lengthMs: 705.03, hitMs: 47 },
  { startMs: 3842.06, lengthMs: 760, hitMs: 49 },
  { startMs: 4652.06, lengthMs: 745, hitMs: 54 },
  { startMs: 5447.06, lengthMs: 700, hitMs: 54 },
  { startMs: 6197.06, lengthMs: 810, hitMs: 56 },
  { startMs: 7057.06, lengthMs: 815.03, hitMs: 61 },
  { startMs: 7922.09, lengthMs: 830, hitMs: 62 },
  { startMs: 8802.09, lengthMs: 690, hitMs: 67 },
];

/** A roll recording picked by `random` (0 to 1), never the one played just before, so two rolls in
 *  a row never sound like a replay.
 *
 *  Example: `rollSampleOf(Math.random, lastPlayed)` */
export function rollSampleOf(
  random: () => number,
  previous: DiceRollSample | null,
): DiceRollSample {
  const choices = DICE_ROLL_SAMPLES.filter((sample) => sample !== previous);
  const index = Math.min(choices.length - 1, Math.floor(random() * choices.length));
  const sample = choices[index];
  if (sample === undefined) {
    throw new RangeError(`Roll sample ${index} is missing: expected 0 to ${choices.length - 1}.`);
  }
  return sample;
}
