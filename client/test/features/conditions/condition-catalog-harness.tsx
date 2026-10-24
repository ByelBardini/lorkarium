import { act, render, screen } from '@testing-library/react';
import {
  DEFAULT_CONDITION_NAMES,
  type ConditionDefinitionDto,
  type ConditionToneDto,
} from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { ConditionCatalogLink } from '@/features/conditions/condition-catalog-link';
import { ConditionCatalogPage } from '@/features/conditions/condition-catalog-page';
import type { BoardEvent } from '@/services/board-events';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { eventAt, vharnBoard, VHARN_GRID } from '../../support/table-session-fixtures';

const TONE_OF: Readonly<Record<string, ConditionToneDto>> = {
  Abençoado: 'benefit',
  Concentrando: 'benefit',
  Invisível: 'benefit',
  Atordoado: 'incapacitating',
  Paralisado: 'incapacitating',
};

/** A condition of the table's list: a harm with the plain mark, no description and no stacking
 *  by default.
 *
 *  Example: `conditionDefinition({ name: 'Cego', description: 'Não vê.' })` */
export function conditionDefinition(
  overrides: Partial<ConditionDefinitionDto> = {},
): ConditionDefinitionDto {
  const name = overrides.name ?? 'Envenenado';
  return {
    id: `def-${name}`,
    name,
    tone: TONE_OF[name] ?? 'harm',
    icon: 'circle-dot',
    look: null,
    description: '',
    maxStacks: null,
    color: null,
    ...overrides,
  };
}

/** The 11 default conditions, as a new table lists them. */
export function defaultDefinitions(): ConditionDefinitionDto[] {
  return DEFAULT_CONDITION_NAMES.map((name) => conditionDefinition({ name }));
}

/** The editor sheet, named "Editar X" or "Nova condição". */
export function editorSheet(name: string): HTMLElement {
  return screen.getByRole('dialog', { name });
}

/** The card of a condition on the page; found under an open sheet too (Radix hides the rest). */
export function conditionCard(name: string): HTMLElement {
  return screen.getByRole('button', { name: `Editar ${name}`, hidden: true });
}

/** A link to a cast holding `definitions` (VHARN at version 4), its commands played by
 *  `commands`; `confirm(event)` delivers the next confirmed event to the cast. Nothing rendered.
 *
 *  Example: `const { link, confirm } = catalogLinkOver([conditionDefinition()])` */
export function catalogLinkOver(definitions: readonly ConditionDefinitionDto[]) {
  const cast: StoreApi<BoardStore> = createBoardStore(VHARN.id, () => undefined);
  cast.getState().apply({
    kind: 'board',
    state: vharnBoard({ conditionDefinitions: [...definitions] }),
  });
  const commands = new TableBoardCommandsFake();
  const link: ConditionCatalogLink = { scope: VHARN_GRID, cast, commands };
  let version = 4;
  const confirm = (event: Parameters<typeof eventAt>[1]): void => {
    version += 1;
    const confirmed: BoardEvent = eventAt(version, event);
    act(() => cast.getState().apply({ kind: 'boardEvent', event: confirmed }));
  };
  return { link, cast, commands, confirm };
}

/** The page over `catalogLinkOver(definitions)`.
 *
 *  Example: `const { commands } = renderCatalog([conditionDefinition()])` */
export function renderCatalog(definitions: readonly ConditionDefinitionDto[]) {
  const catalog = catalogLinkOver(definitions);
  render(<ConditionCatalogPage link={catalog.link} />);
  return catalog;
}
