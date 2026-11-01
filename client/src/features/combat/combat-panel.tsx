import type { CombatEntryInput, TokenDto } from '@lorkarium/contracts';
import { useMemo, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useBoardSight } from '@/features/board/use-board-sight';
import { SceneTokenList } from '@/features/tokens/scene-token-list';
import { TokenDock } from '@/features/tokens/token-dock';
import { seenTokensOf } from '@/lib/board-sight';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import type { CharactersStore } from '@/stores/characters-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { CombatHeader } from './combat-header';
import { CombatPrep, type CombatPrepMode } from './combat-prep';
import { CombatRecapLines } from './combat-recap';
import { CombatantList } from './combatant-list';
import { TokenlessEntryForm, type TokenlessEntry } from './tokenless-entry-form';
import { useCombatRecap } from './use-combat-recap';

export type CombatPanelTable = Readonly<{
  presence: StoreApi<TablePresenceStore>;
  board: StoreApi<BoardStore>;
  /** The dock falls back to the viewer's character. */
  characters: StoreApi<CharactersStore>;
}>;

export type CombatPanelProps = Readonly<{
  table: CombatPanelTable;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  onEditToken: (tokenId: string) => void;
}>;

/** What the tab shows besides the board's state: the preparation to start or to add, or the form
 *  of an entry without token. Local: switching tab or reloading drops it. */
type PanelMode = 'idle' | CombatPrepMode | 'tokenless';

const NO_TOKENS: readonly TokenDto[] = [];

/** The "Combate" tab: out of combat → the scene and "Iniciar combate"; the preparation ("Quem
 *  entra na briga?") in the panel itself; in combat → the round, the turn and the order. The
 *  selected token's detail stays at the foot, in combat and out of it. A refused start keeps the
 *  preparation open with what was typed.
 *
 *  Example: `<CombatPanel table={table} interaction={interaction} isMaster onEditToken={edit} />` */
export function CombatPanel(props: CombatPanelProps): React.JSX.Element {
  const { table, interaction, isMaster } = props;
  const [mode, setMode] = useState<PanelMode>('idle');
  const inCombat = useBoard(table.board, (state) => state.board?.combat != null);
  const recap = useCombatRecap(table.board, interaction);
  const shown = shownModeOf(mode, inCombat);
  if (shown === 'start' || shown === 'add') {
    return <PanelPrep {...props} mode={shown} onDone={() => setMode('idle')} />;
  }
  const turnRecap = inCombat && recap.lines.length > 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {recap.ended && !inCombat && (
        <CombatRecapLines lines={recap.lines} onDismiss={recap.dismiss} />
      )}
      <CombatHeader
        board={table.board}
        interaction={interaction}
        isMaster={isMaster}
        onPrepare={() => setMode('start')}
        onAdd={() => setMode('add')}
        onTokenless={() => setMode('tokenless')}
        recap={turnRecap ? <CombatRecapLines lines={recap.lines} /> : null}
      />
      {shown === 'tokenless' && (
        <TokenlessFormOf interaction={interaction} onDone={() => setMode('idle')} />
      )}
      <PanelList {...props} inCombat={inCombat} />
      <TokenDock
        board={table.board}
        presence={table.presence}
        characters={table.characters}
        interaction={interaction}
        isMaster={isMaster}
        onEditToken={props.onEditToken}
      />
    </div>
  );
}

// In combat the tracker; out of it, "Na cena".
function PanelList(props: CombatPanelProps & Readonly<{ inCombat: boolean }>) {
  const { table, interaction, isMaster } = props;
  return (
    <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
      {props.inCombat ? (
        <CombatantList
          board={table.board}
          presence={table.presence}
          interaction={interaction}
          isMaster={isMaster}
        />
      ) : (
        <SceneTokenList
          board={table.board}
          presence={table.presence}
          interaction={interaction}
          isMaster={isMaster}
        />
      )}
    </div>
  );
}

// The preparation to start needs no combat, the one to add and the form need one: a combat that
// starts or ends elsewhere closes them.
function shownModeOf(mode: PanelMode, inCombat: boolean): PanelMode {
  if (mode === 'start') return inCombat ? 'idle' : 'start';
  if (mode === 'add' || mode === 'tokenless') return inCombat ? mode : 'idle';
  return 'idle';
}

type PanelPrepProps = CombatPanelProps & Readonly<{ mode: CombatPrepMode; onDone: () => void }>;

function PanelPrep({ table, interaction, mode, onDone }: PanelPrepProps) {
  const state = useBoard(table.board, (current) => current.board);
  const sight = useBoardSight(table.board, interaction);
  const seen = useMemo(() => (state ? seenTokensOf(state, sight) : NO_TOKENS), [state, sight]);
  const members = useTablePresence(table.presence, (current) => current.members);
  const readOnly = useBoardInteraction(interaction, (current) => current.readOnly);
  const submit = async (entries: readonly CombatEntryInput[]): Promise<void> => {
    const ok = await interaction
      .getState()
      .command((c, id) =>
        mode === 'start' ? c.startCombat(id, entries) : c.addCombatants(id, entries),
      );
    if (ok) onDone();
  };
  return (
    <CombatPrep
      mode={mode}
      tokens={seen}
      combat={state?.combat ?? null}
      members={members}
      readOnly={readOnly}
      onSubmit={(entries) => void submit(entries)}
      onCancel={onDone}
    />
  );
}

type TokenlessFormOfProps = Readonly<{
  interaction: StoreApi<BoardInteractionStore>;
  onDone: () => void;
}>;

function TokenlessFormOf({ interaction, onDone }: TokenlessFormOfProps) {
  const readOnly = useBoardInteraction(interaction, (current) => current.readOnly);
  const create = ({ name, initiative }: TokenlessEntry): Promise<boolean> =>
    interaction
      .getState()
      .command((c, id) => c.addCombatants(id, [{ name, tokenIds: [], initiative }]));
  return <TokenlessEntryForm disabled={readOnly} onCreate={create} onCancel={onDone} />;
}
