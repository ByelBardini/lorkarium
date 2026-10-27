import type {
  BarColorDto,
  BarDisplayDto,
  BarVisibilityDto,
  TokenSideDto,
} from '@lorkarium/contracts';
import type { ChoiceOption } from '@/components/choice-field';

export const SIDE_OPTIONS: readonly ChoiceOption<TokenSideDto>[] = [
  { value: 'ally', label: 'Aliado' },
  { value: 'enemy', label: 'Inimigo' },
  { value: 'neutral', label: 'Neutro' },
];

/** Who sees the numbers of a bar, as its toggle reads. */
export const VISIBILITY_TEXT: Readonly<Record<BarVisibilityDto, string>> = {
  everyone: 'Todos veem',
  controllers: 'Só mestre e quem controla',
};

/** How a bar shows its value, as its toggle reads ("Como PV aparece: Valor inteiro"). */
export const DISPLAY_TEXT: Readonly<Record<BarDisplayDto, string>> = {
  number: 'Valor inteiro',
  percent: 'Percentual',
};

export const BARS_HINT =
  'A barra de cima é a que aparece no token. Os valores atuais você ajusta depois, no cartão do token.';

/** How a bar starts: by "Nova barra" (the first is the PV) or by a suggestion. */
export type BarPreset = Readonly<{
  label: string;
  color: BarColorDto;
  visibility: BarVisibilityDto;
}>;

/** The suggestions of the "Barras" tab, in the order they are offered. */
export const BAR_PRESETS = {
  pv: { label: 'PV', color: 'ember', visibility: 'controllers' },
  mana: { label: 'Mana', color: 'steel', visibility: 'everyone' },
  shield: { label: 'Escudo', color: 'ash', visibility: 'everyone' },
  breath: { label: 'Fôlego', color: 'moss', visibility: 'everyone' },
} as const satisfies Readonly<Record<string, BarPreset>>;

export const BAR_MAX_PROBLEM = 'De 1 a 99 999.';

/** "Excluir Kael? Isso não tem volta." */
export function deleteTokenQuestion(name: string): string {
  return `Excluir ${name}? Isso não tem volta.`;
}

export const NEW_TOKEN_SUBTITLE = 'Todo mundo na mesa vê o token assim que você criar.';
export const EDIT_TOKEN_SUBTITLE = 'As mudanças aparecem pra todo mundo assim que você salvar.';
/** A player's dialog has no "Visão e luz": it opens the fog, so it stays with the master. */
export const PLAYER_NEW_TOKEN_SUBTITLE = `${NEW_TOKEN_SUBTITLE} Visão e luz ficam com o mestre.`;
export const PLAYER_EDIT_TOKEN_SUBTITLE = `${EDIT_TOKEN_SUBTITLE} Visão e luz ficam com o mestre.`;

/** The footer of the token dialog after a save with something to fix. */
export const MISSING_FIELDS = 'Falta preencher o que está marcado.';

/** The preset sizes of the "Tamanho" field (square, in cells), by the usual names of the market. */
export const SIZE_PRESETS: readonly Readonly<{ cells: number; label: string; shown: string }>[] = [
  { cells: 0.5, label: 'Miúdo', shown: '½' },
  { cells: 1, label: 'Médio', shown: '1×1' },
  { cells: 2, label: 'Grande', shown: '2×2' },
  { cells: 3, label: 'Enorme', shown: '3×3' },
  { cells: 4, label: 'Imenso', shown: '4×4' },
];

export const MASTER_CONTROLS_HINT = 'Você, como mestre, já controla tudo.';
export const CREATOR_CONTROLS_HINT = 'Você criou, então sempre controla.';
export const NO_PLAYERS_HINT = 'Nenhum jogador na mesa ainda.';
export const CONTROL_HINT =
  'Quem controla move o token, mexe nas barras e condições e vê as barras escondidas.';

export const SEES_IN_DARK_HINT = 'Vê sem luz até o alcance abaixo.';
export const DARKVISION_HINT = 'Sem isso, o token vê só onde há luz.';
export const PENUMBRA_HINT = 'Na penumbra, vê o mapa, mas não vê tokens.';
export const LIGHT_HINT = 'Como uma tocha. Nasce acesa; quem controla apaga pelo menu do token.';
export const SIGHT_ANGLE_HINT =
  '360 = vê para todo lado; menos, vê em cone para onde o token olha, e sente o que está a 1 casa em volta.';
export const LIGHT_ANGLE_HINT =
  '360 = ilumina em volta; menos, ilumina em cone, como uma lanterna.';

export const LINK_TO_CARD_TITLE = 'Ligar à ficha de…';
export const UNLINK_FROM_CARD = 'Desligar da ficha';

/** The confirmation of linking a token to a card that already has a character.
 *
 *  Example: `characterLinkQuestion('Lyra', 'Bia') // 'Este token passa a usar as barras e condições de Lyra (ficha de Bia).'` */
export function characterLinkQuestion(characterName: string, memberName: string): string {
  return `Este token passa a usar as barras e condições de ${characterName} (ficha de ${memberName}).`;
}

/** The mark of the fields a linked token shares with its character.
 *
 *  Example: `sharedFieldsNote('Bia') // 'Na ficha de Bia · vale em todo grid'` */
export function sharedFieldsNote(memberName: string): string {
  return `Na ficha de ${memberName} · vale em todo grid`;
}
