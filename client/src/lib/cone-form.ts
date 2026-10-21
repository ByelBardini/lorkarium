import { CONE_ANGLE_MAX } from '@lorkarium/contracts';

/** The opening of a cone as typed: whole degrees, empty = every side. */
export type ConeFieldResult =
  Readonly<{ ok: true; angle: number }> | Readonly<{ ok: false; error: string }>;

const OUT_OF_RANGE = `De 1 a ${CONE_ANGLE_MAX}°.`;
const NOT_WHOLE = `Use graus inteiros, de 1 a ${CONE_ANGLE_MAX}.`;

/** The text an opening opens with in its field ("Campo de visão", "Abertura do feixe", "Abertura").
 *
 *  Example: `coneFieldOf(90) // '90'` */
export function coneFieldOf(angle: number): string {
  return String(angle);
}

/** The opening typed → whole degrees from 1 to 360; empty is every side (360). The message is the
 *  one under the field.
 *
 *  Example: `parseConeField('0') // { ok: false, error: 'De 1 a 360°.' }` */
export function parseConeField(typed: string): ConeFieldResult {
  const text = typed.trim();
  if (text === '') return { ok: true, angle: CONE_ANGLE_MAX };
  if (!/^\d+$/.test(text)) return { ok: false, error: NOT_WHOLE };
  const angle = Number(text);
  if (angle < 1 || angle > CONE_ANGLE_MAX) return { ok: false, error: OUT_OF_RANGE };
  return { ok: true, angle };
}
