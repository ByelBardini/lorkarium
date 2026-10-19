import type { BarDisplayDto, BarVisibilityDto, TokenSideDto } from '@lorkarium/contracts';
import type { ChoiceOption } from '@/components/choice-field';

export const SIDE_OPTIONS: readonly ChoiceOption<TokenSideDto>[] = [
  { value: 'ally', label: 'Aliado' },
  { value: 'enemy', label: 'Inimigo' },
  { value: 'neutral', label: 'Neutro' },
];

export const VISIBILITY_OPTIONS: readonly ChoiceOption<BarVisibilityDto>[] = [
  { value: 'everyone', label: 'Todos veem' },
  { value: 'controllers', label: 'Só mestre e quem controla' },
];

export const DISPLAY_OPTIONS: readonly ChoiceOption<BarDisplayDto>[] = [
  { value: 'number', label: 'Valor inteiro' },
  { value: 'percent', label: 'Percentual' },
];

export const FIRST_BAR_HINT = 'A primeira barra aparece no token.';

/** "Excluir Kael? Isso não tem volta." */
export function deleteTokenQuestion(name: string): string {
  return `Excluir ${name}? Isso não tem volta.`;
}
