import type { TokenDto } from '@lorkarium/contracts';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';

export type TokenHiddenItemsProps = Readonly<{
  /** The tokens the menu acts on: the selection when the token is in it, else that token. */
  targets: readonly TokenDto[];
  interaction: StoreApi<BoardInteractionStore>;
}>;

/** The master's "Tornar invisível" (some target still visible to the players) and "Tornar
 *  visível" (some target hidden); a mixed selection gets both, and each sends only the tokens it
 *  changes.
 *
 *  Example: `{isMaster && <TokenHiddenItems targets={targets} interaction={interaction} />}` */
export function TokenHiddenItems({ targets, interaction }: TokenHiddenItemsProps) {
  const setHidden = (hidden: boolean): void =>
    void interaction.getState().setTokensHidden(targets, hidden);
  return (
    <>
      {targets.some(({ hidden }) => !hidden) && (
        <DropdownMenuItem onSelect={() => setHidden(true)}>
          <EyeOffIcon aria-hidden="true" />
          Tornar invisível
        </DropdownMenuItem>
      )}
      {targets.some(({ hidden }) => hidden) && (
        <DropdownMenuItem onSelect={() => setHidden(false)}>
          <EyeIcon aria-hidden="true" />
          Tornar visível
        </DropdownMenuItem>
      )}
    </>
  );
}
