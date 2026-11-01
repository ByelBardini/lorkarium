import type { CharacterDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { BarLine } from './bar-line';
import { BarQuickEdit } from './bar-quick-edit';
import { TokenAvatar } from './token-avatar';

export type CharacterDockProps = Readonly<{
  character: CharacterDto;
  interaction: StoreApi<BoardInteractionStore>;
}>;

/** The foot of the Combate tab with nothing selected and no token of the viewer's character in
 *  this grid: the character itself, its bars adjustable by whoever controls it
 *  (`character:adjustBar`, the same balloon as a token's).
 *
 *  Example: `<CharacterDock character={lyra} interaction={interaction} />` */
export function CharacterDock({ character, interaction }: CharacterDockProps): React.JSX.Element {
  return (
    <section
      aria-label="Meu personagem"
      // -mx-1 px-1: overflow-y-auto also clips X, and the avatar's side ring is a shadow outside it.
      className="-mx-1 flex max-h-[58%] shrink-0 flex-col gap-3 overflow-y-auto border-t border-border px-1 pt-3"
    >
      <header className="flex items-center gap-3">
        <TokenAvatar token={character} />
        <span className="flex min-w-0 flex-1 flex-col">
          <h3 className="truncate font-display text-xl font-semibold">{character.name}</h3>
          <span className="truncate text-xs text-muted-foreground">Sem token neste grid</span>
        </span>
      </header>
      <CharacterBars character={character} interaction={interaction} />
    </section>
  );
}

function CharacterBars({ character, interaction }: CharacterDockProps) {
  if (character.bars.length === 0) {
    return <p className="text-sm text-muted-foreground">Esse personagem não tem barras.</p>;
  }
  const target = { characterId: character.id };
  return (
    <ul className="flex flex-col gap-3">
      {character.bars.map((bar) => (
        <li key={bar.id}>
          {character.canControl ? (
            <BarQuickEdit
              target={target}
              bar={bar}
              name={`${bar.label} de ${character.name}`}
              interaction={interaction}
            >
              <BarLine bar={bar} withNumbers />
            </BarQuickEdit>
          ) : (
            <BarLine bar={bar} />
          )}
        </li>
      ))}
    </ul>
  );
}
