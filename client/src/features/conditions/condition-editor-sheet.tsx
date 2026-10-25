import type { ConditionDefinitionDto } from '@lorkarium/contracts';
import { Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import type { BoardCommandResult } from '@/services/table-board-commands';
import {
  NEW_CONDITION_VALUES,
  type ConditionCatalogLink,
  type ConditionFormValues,
} from './condition-catalog-link';
import { ConditionDefinitionForm, type ConditionImageTarget } from './condition-definition-form';

/** What the editor sheet holds: a new condition being written, or one of the list. */
export type EditorChoice =
  Readonly<{ kind: 'new' }> | Readonly<{ kind: 'edit'; conditionId: string }>;

export type ConditionEditorSheetProps = Readonly<{
  link: ConditionCatalogLink;
  definitions: readonly ConditionDefinitionDto[];
  /** `null` = the sheet is closed. */
  choice: EditorChoice | null;
  onChoose: (choice: EditorChoice | null) => void;
  onDelete: (definition: ConditionDefinitionDto) => void;
}>;

/** The sheet on the right of "Condições da mesa": the form of the condition a card opened (with
 *  "Excluir") or the one of "Nova condição". It closes by its ×, Esc on the sheet or a click
 *  outside; a condition that leaves the list (deleted here or by another master) closes it.
 *
 *  Example: `<ConditionEditorSheet link={link} definitions={definitions} choice={choice} onChoose={setChoice} onDelete={setDeleting} />` */
export function ConditionEditorSheet(props: ConditionEditorSheetProps): React.JSX.Element {
  const open = openDefinitionOf(props.definitions, props.choice);
  const shown = props.choice?.kind === 'new' || open !== null;
  return (
    <Sheet open={shown} onOpenChange={(next) => !next && props.onChoose(null)}>
      <SheetContent
        className="w-full gap-0 overflow-y-auto p-6 pt-12 data-[side=right]:sm:max-w-xl"
        onEscapeKeyDown={keepOpenOnChangedForm}
      >
        <SheetTitle className="sr-only">
          {open ? `Editar ${open.name}` : 'Nova condição'}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Cada mudança salva vale na hora para todos.
        </SheetDescription>
        {/* `@container`: the form lays its fields out by the sheet's width, not the screen's. */}
        <div className="@container">
          <SheetBody {...props} open={open} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Radix hears Esc on the document before React: the form's preventDefault comes too late, so the
// sheet itself declines to close while the form holds a change (the form then resets it).
function keepOpenOnChangedForm(event: KeyboardEvent): void {
  if (event.target instanceof Element && event.target.closest('form[data-dirty]')) {
    event.preventDefault();
  }
}

function openDefinitionOf(
  definitions: readonly ConditionDefinitionDto[],
  choice: EditorChoice | null,
): ConditionDefinitionDto | null {
  if (choice?.kind !== 'edit') return null;
  return definitions.find((definition) => definition.id === choice.conditionId) ?? null;
}

function SheetBody(
  props: ConditionEditorSheetProps & Readonly<{ open: ConditionDefinitionDto | null }>,
): React.JSX.Element | null {
  const { link, open, onChoose } = props;
  if (props.choice?.kind === 'new') return <NewConditionEditor link={link} onChoose={onChoose} />;
  if (!open) return null;
  return (
    <ConditionDefinitionForm
      // A confirmed save (or another master's) arrives as a new definition: the form restarts
      // from it.
      key={definitionKeyOf(open)}
      mode="edit"
      label={open.name}
      initial={formValuesOf(open)}
      action={<DeleteButton definition={open} onDelete={props.onDelete} />}
      images={imagesOf(link)}
      onSubmit={(values) =>
        link.commands.updateConditionDefinition(link.scope, { conditionId: open.id, ...values })
      }
    />
  );
}

function definitionKeyOf(definition: ConditionDefinitionDto): string {
  const { id, name, tone, icon, color, look, description, maxStacks, imageAssetId } = definition;
  return [id, name, tone, icon, color, look, description, maxStacks, imageAssetId].join(':');
}

function imagesOf(link: ConditionCatalogLink): ConditionImageTarget {
  return { campaignId: link.scope.campaignId, assets: link.assets };
}

type NewConditionEditorProps = Readonly<{
  link: ConditionCatalogLink;
  onChoose: (choice: EditorChoice | null) => void;
}>;

// Created, the sheet moves on to the new condition: its event already put it on the list.
function NewConditionEditor({ link, onChoose }: NewConditionEditorProps): React.JSX.Element {
  const create = async (values: ConditionFormValues): Promise<BoardCommandResult> => {
    const result = await link.commands.defineCondition(link.scope, values);
    if (!result.ok) return result;
    const created = link.cast
      .getState()
      .board?.conditionDefinitions.find((definition) => definition.name === values.name);
    onChoose(created ? { kind: 'edit', conditionId: created.id } : null);
    return result;
  };
  return (
    <ConditionDefinitionForm
      mode="new"
      label="Nova condição"
      initial={NEW_CONDITION_VALUES}
      images={imagesOf(link)}
      onSubmit={create}
      onCancel={() => onChoose(null)}
    />
  );
}

type DeleteButtonProps = Readonly<{
  definition: ConditionDefinitionDto;
  onDelete: (definition: ConditionDefinitionDto) => void;
}>;

function DeleteButton({ definition, onDelete }: DeleteButtonProps): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={`Excluir ${definition.name}`}
      onClick={() => onDelete(definition)}
      className="shrink-0 hover:border-destructive hover:text-destructive-text"
    >
      <Trash2Icon aria-hidden="true" />
      Excluir
    </Button>
  );
}

// Only what the form edits: the id would ride along into the command, which is strict.
function formValuesOf(definition: ConditionDefinitionDto): ConditionFormValues {
  const { name, tone, icon, color, look, description, maxStacks, imageAssetId } = definition;
  return { name, tone, icon, color, look, description, maxStacks, imageAssetId };
}
