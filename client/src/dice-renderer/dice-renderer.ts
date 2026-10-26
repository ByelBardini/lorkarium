import type { DiceAppearanceDto, DiceThrowDto } from '@lorkarium/contracts';

/** A roll handed to the 3D layer: its id, the throw of the event and the roller's appearance
 *  (profile color, texture, number color). */
export interface DiceRendererRoll {
  readonly rollId: string;
  readonly throw: DiceThrowDto;
  readonly appearance: DiceAppearanceDto;
}

/** The 3D dice over the whole window, drawn from confirmed throws only. The adapter (three.js,
 *  loaded on demand) pins each roll to its own clock on `show`, draws `diceSceneAt` while a
 *  roll is alive and stops its frame loop when none is left; it never takes pointer events.
 *
 *  Example: `renderer.show({ rollId, throw: event.throw, appearance: event.appearance })` */
export interface DiceRenderer {
  /** Starts a roll now; a `rollId` already shown is ignored. */
  show(roll: DiceRendererRoll): void;
  /** Drops every roll on screen at once (3D turned off); the renderer stays usable. */
  clear(): void;
  /** Stops the frame loop, frees the GPU resources and removes the canvas; final. */
  destroy(): void;
}

/** Builds the renderer when the first roll arrives with 3D on (keeps three.js out of the
 *  bundle until then).
 *
 *  Example: `const renderer = await createDiceRenderer()` */
export type DiceRendererFactory = () => Promise<DiceRenderer>;
