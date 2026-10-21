import type { TokenDto, TokenSideDto } from '@lorkarium/contracts';
import { creatureItemsOf, type PrepItem } from './combat-prep';

/** One side of "Na cena": "Grupo · 3", its lines (the same creature folded, allies never). */
export type SceneSection = Readonly<{
  side: TokenSideDto;
  title: string;
  count: number;
  items: readonly PrepItem[];
}>;

const SIDES: readonly Readonly<{ side: TokenSideDto; title: string }>[] = [
  { side: 'ally', title: 'Grupo' },
  { side: 'enemy', title: 'Inimigos' },
  { side: 'neutral', title: 'Neutros' },
];

/** The scene's tokens by side, by name: "Grupo", "Inimigos", "Neutros" (an empty side is left
 *  out); among enemies and neutrals the same creature is one group. Pass the seen tokens of the
 *  Tokens layer. Example: `sceneSectionsOf(tokens).map(({ title, count }) => `${title} · ${count}`)` */
export function sceneSectionsOf(tokens: readonly TokenDto[]): SceneSection[] {
  const sorted = [...tokens].sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR', { numeric: true }),
  );
  return SIDES.flatMap(({ side, title }) => {
    const ofSide = sorted.filter((token) => token.side === side);
    if (ofSide.length === 0) return [];
    const items =
      side === 'ally'
        ? ofSide.map((token) => ({ kind: 'token' as const, token }))
        : creatureItemsOf(ofSide);
    return [{ side, title, count: ofSide.length, items }];
  });
}
