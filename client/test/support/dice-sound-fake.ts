import type { DiceRollCue } from '@/dice-audio/dice-roll-cues';
import type { DiceSound, DiceSoundFactory } from '@/dice-audio/dice-sound';

/** A dice sound the test watches: the cues of every roll played, the stops and the end. */
export class DiceSoundFake implements DiceSound {
  readonly played: (readonly DiceRollCue[])[] = [];
  stops = 0;
  destroyed = false;

  play(cues: readonly DiceRollCue[]): void {
    this.played.push(cues);
  }

  stop(): void {
    this.stops += 1;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

/** Behind `createDiceSound`: keeps every sound made.
 *
 *  Example: `expect(deps.diceSounds.latest().played).toHaveLength(1)` */
export class DiceSoundsFake {
  readonly made: DiceSoundFake[] = [];

  readonly create: DiceSoundFactory = () => {
    const sound = new DiceSoundFake();
    this.made.push(sound);
    return sound;
  };

  latest(): DiceSoundFake {
    const sound = this.made.at(-1);
    if (sound === undefined) throw new Error('No dice sound was made: expected at least 1.');
    return sound;
  }
}
