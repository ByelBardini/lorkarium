/** The grid column that contains a world coordinate.
 *
 *  Example: `cellOf(130, 50) // { column: 2 }` */
export function cellOf(worldX: number, gridSize: number): { column: number } {
  return { column: Math.floor(worldX / gridSize) };
}
