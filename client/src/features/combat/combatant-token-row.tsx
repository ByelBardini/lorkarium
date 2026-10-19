import type { TokenDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { TokenCard } from '@/features/tokens/token-card';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import { DEFEATED_TOKEN_SUFFIX } from './combat-view';
import { ConditionSummary } from './condition-marks';
import { DefeatedLabel } from './defeated-label';
import { TokenInCombatMenu, type EntryChoice } from './token-in-combat-menu';

export type CombatantTokenRowProps = Readonly<{
  token: TokenDto;
  /** The only token of its entry: no "Separar". */
  alone: boolean;
  others: readonly EntryChoice[];
  open: boolean;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  onEditToken: (tokenId: string) => void;
}>;

/** One token under its entry in the tracker, indented, with its conditions; picking it selects the
 *  token and opens its card. The master's menu splits, moves or takes out only this token.
 *
 *  Example: `<CombatantTokenRow token={goblin} alone={false} others={entries} open={false} … />` */
export function CombatantTokenRow(props: CombatantTokenRowProps): React.JSX.Element {
  const { token, alone, others, open, interaction, isMaster } = props;
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  const regroup = interaction.getState().command;
  return (
    <li className="pl-4">
      <div className="flex items-center gap-2 py-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => interaction.getState().select(open ? null : token.id)}
          className="min-w-0 flex-1 truncate text-left text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <DefeatedLabel
            text={token.name}
            defeated={token.defeated}
            suffix={DEFEATED_TOKEN_SUFFIX}
            className="block truncate"
          />
          {!open && <ConditionSummary conditions={token.conditions} />}
        </button>
        {isMaster && (
          <TokenInCombatMenu
            name={token.name}
            alone={alone}
            others={others}
            disabled={readOnly}
            onRegroup={(target) => void regroup((c, id) => c.regroupTokens(id, [token.id], target))}
          />
        )}
      </div>
      {open && (
        <TokenCard
          token={token}
          board={props.board}
          interaction={interaction}
          isMaster={isMaster}
          onEdit={props.onEditToken}
        />
      )}
    </li>
  );
}
