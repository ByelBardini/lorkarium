import type { DiceRollCue } from '@/dice-audio/dice-roll-cues';

/** The sound of the rolls, implemented by the Web Audio adapter. `prepare` loads it ahead, so the
 *  first roll is not lost to the loading (idempotent); `play` schedules one roll sound per cue
 *  from now (its time 0, the same instant the 3D throw starts); `stop` silences everything
 *  scheduled and the sound stays usable; `destroy` is final. */
export interface DiceSound {
  prepare(): void;
  play(cues: readonly DiceRollCue[]): void;
  stop(): void;
  destroy(): void;
}

/** Makes the sound of a room. Nothing is heard (nor the audio context created) before the
 *  first `prepare` or `play`.
 *
 *  Example: `const sound = createDiceSound()` */
export type DiceSoundFactory = () => DiceSound;
