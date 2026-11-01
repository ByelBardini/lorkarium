import { act, render, screen } from '@testing-library/react';
import {
  DEFAULT_CONDITION_NAMES,
  type ConditionDefinitionDto,
  type ConditionToneDto,
} from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { ConditionCatalogLink } from '@/features/conditions/condition-catalog-link';
import { ConditionCatalogPage } from '@/features/conditions/condition-catalog-page';
import type { CharacterUpdate } from '@/services/table-session-api';
import { createCharactersStore, type CharactersStore } from '@/stores/characters-store';
import { AssetsApiFake } from '../../support/assets-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import {
  conditionDefinedAt,
  defaultsRestoredAt,
  definitionDeletedAt,
  definitionUpdatedAt,
  tableSynced,
} from '../../support/character-fixtures';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';

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
    imageAssetId: null,
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

/** One confirmed change of the table's list, as `confirm` takes it. */
export type ListChange =
  | Readonly<{
      type: 'conditionDefined';
      payload: Readonly<{ definition: ConditionDefinitionDto }>;
    }>
  | Readonly<{
      type: 'conditionDefinitionUpdated';
      payload: Readonly<{ definition: ConditionDefinitionDto }>;
    }>
  | Readonly<{ type: 'conditionDefinitionDeleted'; payload: Readonly<{ conditionId: string }> }>
  | Readonly<{
      type: 'conditionDefaultsRestored';
      payload: Readonly<{ definitions: ConditionDefinitionDto[] }>;
    }>;

function updateOf(version: number, change: ListChange): CharacterUpdate {
  switch (change.type) {
    case 'conditionDefined':
      return conditionDefinedAt(version, change.payload.definition);
    case 'conditionDefinitionUpdated':
      return definitionUpdatedAt(version, change.payload.definition);
    case 'conditionDefinitionDeleted':
      return definitionDeletedAt(version, change.payload.conditionId);
    case 'conditionDefaultsRestored':
      return defaultsRestoredAt(version, ...change.payload.definitions);
  }
}

/** The scope of the list's commands: the table, no grid. */
export const VHARN_TABLE = { campaignId: VHARN.id } as const;

/** A link to a table stream holding `definitions` (VHARN at version 4), its commands played by
 *  `commands` and its uploads by `assets`; `confirm(change)` delivers the next confirmed event
 *  of the list to the stream. Nothing rendered.
 *
 *  Example: `const { link, confirm } = catalogLinkOver([conditionDefinition()])` */
export function catalogLinkOver(definitions: readonly ConditionDefinitionDto[]) {
  const table: StoreApi<CharactersStore> = createCharactersStore(VHARN.id, () => undefined);
  table.getState().apply(tableSynced(4, [], [...definitions]));
  const commands = new TableBoardCommandsFake();
  const assets = new AssetsApiFake();
  const link: ConditionCatalogLink = { scope: VHARN_TABLE, table, commands, assets };
  let version = 4;
  const confirm = (change: ListChange): void => {
    version += 1;
    act(() => table.getState().apply(updateOf(version, change)));
  };
  return { link, table, commands, assets, confirm };
}

/** The page over `catalogLinkOver(definitions)`.
 *
 *  Example: `const { commands } = renderCatalog([conditionDefinition()])` */
export function renderCatalog(definitions: readonly ConditionDefinitionDto[]) {
  const catalog = catalogLinkOver(definitions);
  render(<ConditionCatalogPage link={catalog.link} />);
  return catalog;
}
