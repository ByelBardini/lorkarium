// Propositalmente errado: VO morando no server.
export type Seat = Readonly<{ index: number }>;

/** A seat at the table.
 *
 *  Example: `seat(2).index // 2` */
export function seat(index: number): Seat {
  return { index };
}
