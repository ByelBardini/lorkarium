import type { SessionMemberDto, TokenDto } from '@lorkarium/contracts';

const NAME_LIST = new Intl.ListFormat('pt-BR', { type: 'conjunction' });

/** "jogado por Bia" (or "jogado por Bia e Caio"), "NPC" when nobody at the table controls it.
 *
 *  Example: `playedByText(lyra, members) // 'jogado por Bia'` */
export function playedByText(
  token: Pick<TokenDto, 'controllerIds'>,
  members: readonly SessionMemberDto[],
): string {
  const names = members
    .filter(({ userId }) => token.controllerIds.includes(userId))
    .map(({ name }) => name);
  if (names.length === 0) return 'NPC';
  return `jogado por ${NAME_LIST.format(names)}`;
}
