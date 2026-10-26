/** The address of an uploaded dice texture (same origin, under `/api`), for the 3D dice and
 *  the preview in "Minha conta".
 *
 *  Example: `diceTextureUrlOf('3f2a…') // '/api/dice-textures/3f2a…'` */
export function diceTextureUrlOf(textureId: string): string {
  return `/api/dice-textures/${encodeURIComponent(textureId)}`;
}
