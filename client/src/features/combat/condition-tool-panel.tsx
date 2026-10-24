import type { ConditionDefinitionDto } from '@lorkarium/contracts';
import { useId, useMemo } from 'react';
import { Link } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { orderedByTone } from '@/lib/condition-names';
import { steppedIndex } from '@/lib/list-step';
import { parseRounds } from '@/lib/numeric-text';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useConditionTool, type ConditionToolStore } from '@/stores/condition-tool-store';
import { ConditionSuggestionList } from './condition-suggestion-list';

export type ConditionToolPanelProps = Readonly<{
  board: StoreApi<BoardStore>;
  conditionTool: StoreApi<ConditionToolStore>;
  campaignId: string;
  /** The master also gets the way to the table's list when it is empty. */
  isMaster: boolean;
}>;

export const NO_TABLE_CONDITIONS = 'A mesa não tem condições.';
export const REMOVE_CONDITION_HINT = 'Shift+clique tira a condição.';

const NO_DEFINITIONS: readonly ConditionDefinitionDto[] = [];

/** What the condition tool stamps, floating beside the toolbar while the tool is on: the table's
 *  conditions by nature (one picked), "Rodadas" (empty or 0 = no limit, up to 99) and how Shift
 *  takes one off. Kept for the whole visit.
 *
 *  Example: `{tool === 'conditions' && !focus && <ConditionToolPanel board={table.board} conditionTool={conditionTool} campaignId={campaign.id} isMaster={isMaster} />}` */
export function ConditionToolPanel(props: ConditionToolPanelProps): React.JSX.Element {
  const definitions = useBoard(
    props.board,
    (state) => state.board?.conditionDefinitions ?? NO_DEFINITIONS,
  );
  return (
    <section
      aria-label="Aplicar condição"
      className="absolute top-16 left-16 flex max-h-[calc(100%-5rem)] w-64 flex-col gap-3 rounded-lg border border-border bg-panel p-4"
    >
      <h2 className="font-display text-sm text-foreground">Aplicar condição</h2>
      {definitions.length === 0 ? (
        <EmptyConditions campaignId={props.campaignId} isMaster={props.isMaster} />
      ) : (
        <>
          <ConditionChoices definitions={definitions} conditionTool={props.conditionTool} />
          <RoundsField conditionTool={props.conditionTool} />
          <p className="text-[13px] text-muted-foreground">{REMOVE_CONDITION_HINT}</p>
        </>
      )}
    </section>
  );
}

type ConditionChoicesProps = Readonly<{
  definitions: readonly ConditionDefinitionDto[];
  conditionTool: StoreApi<ConditionToolStore>;
}>;

// The same grouped list as the condition picker's suggestions, here always open.
function ConditionChoices({ definitions, conditionTool }: ConditionChoicesProps) {
  const id = useId();
  const ordered = useMemo(() => orderedByTone(definitions), [definitions]);
  const conditionId = useConditionTool(conditionTool, (state) => state.conditionId);
  const active = ordered.findIndex((definition) => definition.id === conditionId);
  const take = (name: string): void => {
    const picked = ordered.find((definition) => definition.name === name);
    if (picked) conditionTool.getState().pick(picked.id);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const next = steppedIndex(event.key, active, ordered.length);
    if (next === null) return;
    event.preventDefault();
    const picked = ordered[next];
    if (picked) conditionTool.getState().pick(picked.id);
  };
  return (
    <div className="-mx-2 min-h-0 overflow-y-auto">
      <ConditionSuggestionList
        id={id}
        suggestions={ordered}
        active={active}
        onTake={take}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

function RoundsField({ conditionTool }: Readonly<{ conditionTool: StoreApi<ConditionToolStore> }>) {
  const id = useId();
  const text = useConditionTool(conditionTool, (state) => state.roundsText);
  const invalid = parseRounds(text) === 'invalid';
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="text-[13px] text-label">
        Rodadas
      </Label>
      <Input
        id={id}
        value={text}
        inputMode="numeric"
        placeholder="∞"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(event) => conditionTool.getState().setRoundsText(event.target.value)}
        className="h-8 w-14 text-center text-sm tabular-nums"
      />
      {invalid && (
        <span id={`${id}-error`} className="text-[11px] text-destructive-text">
          De 0 a 99
        </span>
      )}
    </div>
  );
}

function EmptyConditions({
  campaignId,
  isMaster,
}: Readonly<{ campaignId: string; isMaster: boolean }>) {
  return (
    <div className="flex flex-col gap-2 text-[13px] text-muted-foreground">
      <p>{NO_TABLE_CONDITIONS}</p>
      {isMaster && (
        <Link
          to={`/campaigns/${encodeURIComponent(campaignId)}/table/conditions`}
          className="text-primary underline-offset-4 hover:underline"
        >
          Configurar condições
        </Link>
      )}
    </div>
  );
}
