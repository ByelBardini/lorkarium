import type { CombatantDto, TokenDto } from '@lorkarium/contracts';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { TokenCard } from '@/features/tokens/token-card';
import { cn } from '@/lib/utils';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import { CombatantActionsMenu } from './combatant-actions-menu';
import { CombatantNameField } from './combatant-name-field';
import { CombatantTokenRow } from './combatant-token-row';
import {
  DEFEATED_ENTRY_SUFFIX,
  DEFEATED_TOKEN_SUFFIX,
  entryDefeated,
  initiativeText,
} from './combat-view';
import { ConditionSummary } from './condition-marks';
import { DefeatedLabel } from './defeated-label';
import { InitiativeField } from './initiative-field';
import type { EntryChoice } from './token-in-combat-menu';

export type CombatantRowProps = Readonly<{
  combatant: CombatantDto;
  /** "Inimigos", "Kael", "Goblin e mais 1", "Fora de vista". */
  label: string;
  /** The tokens of the entry this viewer sees whole, by name. */
  tokens: readonly TokenDto[];
  /** The other entries, for "Mover para". */
  others: readonly EntryChoice[];
  /** The master, or a player who controls every token of the entry: edits the initiative. */
  canRun: boolean;
  current: boolean;
  /** Tied with the one above / below: only then the master gets ↑ / ↓. */
  tiedAbove: boolean;
  tiedBelow: boolean;
  selectedTokenId: string | null;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  onEditToken: (tokenId: string) => void;
}>;

/** One initiative entry of the tracker: the initiative (a gold box on the turn), the label, ↑/↓
 *  within a tie and the master's menu. An unnamed entry of one token reads as that token and opens
 *  its card; a named or grouped one lists its tokens under it, indented.
 *
 *  Example: `<CombatantRow combatant={entry} label="Inimigos" tokens={goblins} others={[]} canRun current … />` */
export function CombatantRow(props: CombatantRowProps): React.JSX.Element {
  const { combatant, tokens, current } = props;
  const solo = combatant.name === null && combatant.tokenIds.length === 1 ? tokens[0] : undefined;
  return (
    <li
      aria-current={current ? 'true' : undefined}
      className={cn(
        'border-b border-l-2 border-divider pl-2 last:border-b-0',
        current ? 'border-l-primary' : 'border-l-transparent',
      )}
    >
      <EntryLine {...props} solo={solo} />
      {solo && solo.id === props.selectedTokenId && (
        <TokenCard
          token={solo}
          board={props.board}
          interaction={props.interaction}
          isMaster={props.isMaster}
          onEdit={props.onEditToken}
        />
      )}
      {!solo && tokens.length > 0 && <EntryTokens {...props} />}
    </li>
  );
}

function EntryLine(props: CombatantRowProps & Readonly<{ solo: TokenDto | undefined }>) {
  const { combatant, label, interaction, isMaster } = props;
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  const [renaming, setRenaming] = useState(false);
  const send = interaction.getState().command;
  return (
    <div className="flex items-center gap-2 py-1.5">
      <EntryInitiative {...props} disabled={readOnly} />
      {renaming ? (
        <CombatantNameField
          key={combatant.name ?? ''}
          label={label}
          disabled={readOnly}
          onCommit={(name) => void send((c, id) => c.renameCombatant(id, combatant.id, name))}
          onClose={() => setRenaming(false)}
        />
      ) : (
        <EntryLabel {...props} />
      )}
      {isMaster && (
        <MasterActions {...props} disabled={readOnly} onRename={() => setRenaming(true)} />
      )}
    </div>
  );
}

function EntryInitiative(props: CombatantRowProps & Readonly<{ disabled: boolean }>) {
  const { combatant, label, current, canRun, disabled, interaction } = props;
  if (!canRun) {
    return (
      <span
        className={cn(
          'grid h-9 w-14 shrink-0 place-items-center border text-sm tabular-nums',
          current ? 'border-primary text-primary' : 'border-border',
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

function EntryLabel(props: CombatantRowProps & Readonly<{ solo: TokenDto | undefined }>) {
  const { label, solo, tokens, selectedTokenId, interaction } = props;
  if (!solo) {
    return (
      <DefeatedLabel
        text={label}
        defeated={entryDefeated(tokens)}
        suffix={DEFEATED_ENTRY_SUFFIX}
        className="min-w-0 flex-1 truncate text-sm"
      />
    );
  }
  const open = solo.id === selectedTokenId;
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => interaction.getState().select(open ? null : solo.id)}
      className="min-w-0 flex-1 truncate text-left text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <DefeatedLabel
        text={label}
        defeated={solo.defeated}
        suffix={DEFEATED_TOKEN_SUFFIX}
        className="block truncate"
      />
      {!open && <ConditionSummary conditions={solo.conditions} />}
    </button>
  );
}

function EntryTokens(props: CombatantRowProps) {
  const { combatant, label, tokens, others } = props;
  return (
    <ul aria-label={`Tokens de ${label}`} className="flex flex-col pb-1">
      {tokens.map((token) => (
        <CombatantTokenRow
          key={token.id}
          token={token}
          alone={combatant.tokenIds.length === 1}
          others={others}
          open={token.id === props.selectedTokenId}
          board={props.board}
          interaction={props.interaction}
          isMaster={props.isMaster}
          onEditToken={props.onEditToken}
        />
      ))}
    </ul>
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
