import type { SessionMemberDto, TokenDto } from '@lorkarium/contracts';
import { ArrowDownIcon, ArrowUpIcon, SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { TokenLine } from '@/features/tokens/token-line';
import type { TrackerRow } from '@/lib/combat-rows';
import { cn } from '@/lib/utils';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { CombatantActionsMenu } from './combatant-actions-menu';
import { CombatantGroupRow } from './combatant-group-row';
import { CombatantNameField } from './combatant-name-field';
import { initiativeText } from './combat-view';
import { InitiativeField } from './initiative-field';

export type CombatantRowProps = TrackerRow &
  Readonly<{
    current: boolean;
    /** A group's members are shown (by default while it is on turn). */
    open: boolean;
    onToggle: () => void;
    selectedTokenId: string | null;
    members: readonly SessionMemberDto[];
    interaction: StoreApi<BoardInteractionStore>;
    isMaster: boolean;
  }>;

/** One initiative entry of the tracker: the initiative box (gold on the turn), then the token
 *  (face, name, who plays it, first bar, conditions), a foldable group, or the label of an entry
 *  without token; ↑/↓ within a tie and the master's menu at the end.
 *
 *  Example: `<CombatantRow {...row} current open={false} onToggle={flip} selectedTokenId={null} members={members} interaction={interaction} isMaster />` */
export function CombatantRow(props: CombatantRowProps): React.JSX.Element {
  const { combatant, current, interaction, isMaster } = props;
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  const [renaming, setRenaming] = useState(false);
  const send = interaction.getState().command;
  return (
    <li
      aria-current={current ? 'true' : undefined}
      className={cn(
        'flex items-start gap-2 border-b border-l-2 border-b-divider py-2 pr-1 pl-2 last:border-b-0',
        current ? 'border-l-primary bg-primary/10' : 'border-l-transparent',
      )}
    >
      <EntryInitiative {...props} disabled={readOnly} />
      <div className="min-w-0 flex-1 pt-0.5">
        {renaming ? (
          <CombatantNameField
            key={combatant.name ?? ''}
            label={props.label}
            disabled={readOnly}
            onCommit={(name) => void send((c, id) => c.renameCombatant(id, combatant.id, name))}
            onClose={() => setRenaming(false)}
          />
        ) : (
          <EntryBody {...props} />
        )}
      </div>
      {isMaster && (
        <MasterActions {...props} disabled={readOnly} onRename={() => setRenaming(true)} />
      )}
    </li>
  );
}

function EntryBody(props: CombatantRowProps): React.JSX.Element {
  const { combatant, tokens, interaction } = props;
  const solo = soloTokenOf(combatant.name, combatant.tokenIds, tokens);
  if (solo) {
    const selected = solo.id === props.selectedTokenId;
    return (
      <TokenLine
        token={solo}
        members={props.members}
        selected={selected}
        onSelect={() => interaction.getState().select(selected ? null : solo.id)}
      />
    );
  }
  if (tokens.length > 0) return <CombatantGroupRow {...props} />;
  return (
    <span className="flex min-h-8 items-center gap-2.5 text-sm font-semibold">
      {combatant.tokenIds.length === 0 && (
        <SparklesIcon aria-hidden="true" className="size-4 text-muted-foreground" />
      )}
      <span className="truncate">{props.label}</span>
    </span>
  );
}

// An unnamed entry of one token reads as that token.
function soloTokenOf(
  name: string | null,
  tokenIds: readonly string[],
  seen: readonly TokenDto[],
): TokenDto | undefined {
  return name === null && tokenIds.length === 1 ? seen[0] : undefined;
}

function EntryInitiative(props: CombatantRowProps & Readonly<{ disabled: boolean }>) {
  const { combatant, label, current, canRun, disabled, interaction } = props;
  if (!canRun) {
    return (
      <span
        className={cn(
          'grid h-9 w-11 shrink-0 place-items-center rounded-md border text-sm font-semibold tabular-nums',
          current ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
        )}
      >
        {initiativeText(combatant.initiative)}
      </span>
    );
  }
  const send = interaction.getState().command;
  return (
    <InitiativeField
      key={String(combatant.initiative)}
      name={label}
      value={combatant.initiative}
      current={current}
      disabled={disabled}
      onCommit={(value) => send((c, id) => c.setInitiative(id, combatant.id, value))}
    />
  );
}

type MasterActionsProps = CombatantRowProps & Readonly<{ disabled: boolean; onRename: () => void }>;

function MasterActions(props: MasterActionsProps): React.JSX.Element {
  const { combatant, label, tokens, others, tiedAbove, tiedBelow, interaction, disabled } = props;
  const send = interaction.getState().command;
  const move = (direction: 'up' | 'down') => () =>
    void send((c, id) => c.moveInTie(id, combatant.id, direction));
  const onlyToken = combatant.tokenIds.length === 1 ? tokens[0] : undefined;
  return (
    <div className="flex shrink-0 gap-0.5">
      {tiedAbove && (
        <TieButton label={`Subir ${label} no empate`} up disabled={disabled} onClick={move('up')} />
      )}
      {tiedBelow && (
        <TieButton label={`Descer ${label} no empate`} disabled={disabled} onClick={move('down')} />
      )}
      <CombatantActionsMenu
        label={label}
        others={onlyToken ? others : null}
        disabled={disabled}
        onRename={props.onRename}
        onMoveToken={(target) =>
          onlyToken && void send((c, id) => c.regroupTokens(id, [onlyToken.id], target))
        }
        onRemove={() => void send((c, id) => c.removeCombatant(id, combatant.id))}
      />
    </div>
  );
}

type TieButtonProps = Readonly<{
  label: string;
  up?: boolean;
  disabled: boolean;
  onClick: () => void;
}>;

function TieButton({ label, up = false, disabled, onClick }: TieButtonProps): React.JSX.Element {
  const Icon = up ? ArrowUpIcon : ArrowDownIcon;
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
