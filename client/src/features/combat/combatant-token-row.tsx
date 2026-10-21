import type { SessionMemberDto, TokenDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { TokenLine } from '@/features/tokens/token-line';
import type { EntryChoice } from '@/lib/combat-rows';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { TokenInCombatMenu } from './token-in-combat-menu';

export type CombatantTokenRowProps = Readonly<{
  token: TokenDto;
  /** The only token of its entry: no "Separar". */
  alone: boolean;
  others: readonly EntryChoice[];
  selected: boolean;
  members: readonly SessionMemberDto[];
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
}>;

/** One token under its group in the tracker: name, bar and how many conditions; picking it
 *  selects the token (the detail opens at the foot of the panel). The master's menu splits, moves
 *  or takes out only this token.
 *
 *  Example: `<CombatantTokenRow token={goblin} alone={false} others={entries} selected={false} … />` */
export function CombatantTokenRow(props: CombatantTokenRowProps): React.JSX.Element {
  const { token, alone, others, selected, interaction, isMaster } = props;
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  const regroup = interaction.getState().command;
  return (
    <li className="flex items-center gap-2 py-1 pl-2">
      <div className="min-w-0 flex-1">
        <TokenLine
          compact
          token={token}
          members={props.members}
          selected={selected}
          onSelect={() => interaction.getState().select(selected ? null : token.id)}
        />
      </div>
      {isMaster && (
        <TokenInCombatMenu
          name={token.name}
          alone={alone}
          others={others}
          disabled={readOnly}
          onRegroup={(target) => void regroup((c, id) => c.regroupTokens(id, [token.id], target))}
        />
      )}
    </li>
  );
}
