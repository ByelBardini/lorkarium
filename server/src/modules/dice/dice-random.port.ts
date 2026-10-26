/** The randomness of a roll: the face of a die without a model (d2, d7, d1000) and the uniform
 *  numbers the physics turns into a throw (where the die starts, how fast it goes and spins).
 *
 *  Example: `random.face(7) // 4` · `random.unit() // 0.618…` */
export interface DiceRandomPort {
  /** A whole number from 1 to `sides`, each one equally likely (`sides` from 2 to 1000). */
  face(sides: number): number;
  /** A number in [0, 1), uniform. */
  unit(): number;
}
