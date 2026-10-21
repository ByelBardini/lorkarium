import type { CombatantDto, SessionMemberDto, TokenDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { TokenGroupLine } from '@/features/tokens/token-group-line';
import type { EntryChoice } from '@/lib/combat-rows';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { CombatantTokenRow } from './combatant-token-row';

export type CombatantGroupRowProps = Readonly<{
  combatant: CombatantDto;
  label: string;
  /** The entry's tokens this viewer sees, by name. */
  tokens: readonly TokenDto[];
  others: readonly EntryChoice[];
  open: boolean;
  onToggle: () => void;
  selectedTokenId: string | null;
  members: readonly SessionMemberDto[];
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
}>;

/** An entry of several tokens (or named by the master): folded to one line with how many stand
 *  and their bars added up; open, the `ul` "Tokens de Bandido" with a line and a menu per token.
 *
 *  Example: `<CombatantGroupRow combatant={bandits} label="Bandido" tokens={seen} open onToggle={flip} … />` */
export function CombatantGroupRow(props: CombatantGroupRowProps): React.JSX.Element {
  const { combatant, label, tokens } = props;
  return (
    <TokenGroupLine label={label} tokens={tokens} open={props.open} onToggle={props.onToggle}>
      <ul
        aria-label={`Tokens de ${label}`}
        className="mt-1.5 flex flex-col border-l border-divider"
      >
        {tokens.map((token) => (
          <CombatantTokenRow
            key={token.id}
            token={token}
            alone={combatant.tokenIds.length === 1}
            others={props.others}
            selected={token.id === props.selectedTokenId}
            members={props.members}
            interaction={props.interaction}
            isMaster={props.isMaster}
          />
        ))}
      </ul>
    </TokenGroupLine>
  );
}
