import type { BarColorDto, BarVisibilityDto, TokenSideDto } from '@lorkarium/contracts';
import type { ChoiceOption } from '@/components/choice-field';
import { BAR_COLOR_LABEL, barToneVar } from '@/lib/bar-display';

export const SIDE_OPTIONS: readonly ChoiceOption<TokenSideDto>[] = [
  { value: 'ally', label: 'Aliado' },
  { value: 'enemy', label: 'Inimigo' },
  { value: 'neutral', label: 'Neutro' },
];

export const COLOR_OPTIONS: readonly ChoiceOption<BarColorDto>[] = (
  ['gold', 'steel', 'ember', 'moss', 'ash'] as const
).map((color) => ({ value: color, label: BAR_COLOR_LABEL[color], swatch: barToneVar(color) }));

export const VISIBILITY_OPTIONS: readonly ChoiceOption<BarVisibilityDto>[] = [
  { value: 'everyone', label: 'Todos veem' },
  { value: 'controllers', label: 'Só mestre e quem controla' },
];

export const FIRST_BAR_HINT = 'A primeira barra aparece no token.';

/** "Excluir Kael? Isso não tem volta." */
export function deleteTokenQuestion(name: string): string {
  return `Excluir ${name}? Isso não tem volta.`;
}
