export const GREETINGS: readonly string[] = [
  'E aí, {nome}.',
  'Bem-vindo de volta, {nome}.',
  'Opa, {nome}.',
  'Salve, {nome}.',
  'Fala, {nome}.',
  'Que bom te ver, {nome}.',
  'Puxa uma cadeira, {nome}.',
  'Bora rolar uns dados, {nome}?',
  'A mesa te espera, {nome}.',
  'De volta à taverna, {nome}.',
];

/** The home headline: one of the ten greetings, picked by `draw` in [0, 1), with the first name.
 *
 *  Example: `greetingFor('Lucas Rola', 0) // 'E aí, Lucas.'` */
export function greetingFor(fullName: string, draw: number): string {
  if (!(draw >= 0 && draw < 1)) {
    throw new RangeError(`greeting draw must be in [0, 1); received ${draw}`);
  }
  const template = GREETINGS[Math.floor(draw * GREETINGS.length)] ?? 'E aí, {nome}.';
  const firstName = fullName.trim().split(/\s+/)[0] ?? '';
  return template.replace('{nome}', firstName);
}
