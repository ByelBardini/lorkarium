import type { CombatantDto, TokenDto } from '@lorkarium/contracts';
import { ArrowDownIcon, ArrowUpIcon, XIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { TokenCard } from '@/features/tokens/token-card';
import { cn } from '@/lib/utils';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import { initiativeText } from './combat-view';
import { ConditionSummary } from './condition-marks';
import { InitiativeField } from './initiative-field';

export type CombatantRowProps = Readonly<{
  combatant: CombatantDto;
  token: TokenDto;
  board: StoreApi<BoardStore>;
  current: boolean;
  /** Tied with the one above / below: only then the master gets ↑ / ↓. */
  tiedAbove: boolean;
  tiedBelow: boolean;
  open: boolean;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  onEditToken: (tokenId: string) => void;
}>;

/** One line of the tracker: the initiative (a gold box on the turn), the name, ↑/↓ within a tie,
 *  "Tirar do combate"; opening it shows the card of the token.
 *
 *  Example: `<CombatantRow combatant={c} token={token} current tiedAbove={false} tiedBelow open={false} … />` */
export function CombatantRow(props: CombatantRowProps): React.JSX.Element {
  const { combatant, token, current, open, interaction, isMaster } = props;
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  const send = interaction.getState().command;
  const editable = isMaster || token.canControl;
  return (
    <li
      aria-current={current ? 'true' : undefined}
      className={cn(
        'border-b border-l-2 border-divider pl-2 last:border-b-0',
        current ? 'border-l-primary' : 'border-l-transparent',
      )}
    >
      <div className="flex items-center gap-2 py-1.5">
        {editable ? (
          <InitiativeField
            key={String(combatant.initiative)}
            name={token.name}
            value={combatant.initiative}
            current={current}
            disabled={readOnly}
            onCommit={(value) => send((c, id) => c.setInitiative(id, combatant.id, value))}
          />
        ) : (
          <span
            className={cn(
              'grid h-9 w-14 place-items-center border text-sm tabular-nums',
              current ? 'border-primary text-primary' : 'border-border',
            )}
          >
            {initiativeText(combatant.initiative)}
          </span>
        )}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => interaction.getState().select(open ? null : token.id)}
          className="min-w-0 flex-1 truncate text-left text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="block truncate">{token.name}</span>
          <ConditionSummary conditions={token.conditions} />
        </button>
        {isMaster && <MasterActions {...props} disabled={readOnly} />}
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

function MasterActions({
  combatant,
  token,
  tiedAbove,
  tiedBelow,
  interaction,
  disabled,
}: CombatantRowProps & Readonly<{ disabled: boolean }>): React.JSX.Element {
  const send = interaction.getState().command;
  const move = (direction: 'up' | 'down') => () =>
    void send((c, id) => c.moveInTie(id, combatant.id, direction));
  return (
    <div className="flex shrink-0 gap-0.5">
      {tiedAbove && (
        <RowAction
          label={`Subir ${token.name} no empate`}
          icon={ArrowUpIcon}
          disabled={disabled}
          onClick={move('up')}
        />
      )}
      {tiedBelow && (
        <RowAction
          label={`Descer ${token.name} no empate`}
          icon={ArrowDownIcon}
          disabled={disabled}
          onClick={move('down')}
        />
      )}
      <RowAction
        label={`Tirar ${token.name} do combate`}
        icon={XIcon}
        disabled={disabled}
        onClick={() => void send((c, id) => c.removeCombatant(id, combatant.id))}
      />
    </div>
  );
}

type RowActionProps = Readonly<{
  label: string;
  icon: React.ComponentType<{ 'aria-hidden'?: boolean | 'true' }>;
  disabled: boolean;
  onClick: () => void;
}>;

function RowAction({ label, icon: Icon, disabled, onClick }: RowActionProps): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
