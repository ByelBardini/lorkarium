import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ConditionCatalogPage } from '@/features/conditions/condition-catalog-page';
import { createCharactersStore } from '@/stores/characters-store';
import { AssetsApiFake } from '../../support/assets-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  conditionCard,
  conditionDefinition,
  defaultDefinitions,
  editorSheet,
  renderCatalog,
} from './condition-catalog-harness';

const ENVENENADO = conditionDefinition({ name: 'Envenenado', description: 'Desvantagem.' });
const CAIDO = conditionDefinition({ name: 'Caído' });

function cardNames(): string[] {
  return screen
    .queryAllByRole('button', { name: /^Editar / })
    .map((card) => card.getAttribute('aria-label') ?? '');
}

async function search(text: string): Promise<void> {
  await userEvent.type(screen.getByLabelText('Buscar condição'), text);
}

describe('ConditionCatalogPage', () => {
  it('without the table open it only says to open it', () => {
    render(<ConditionCatalogPage link={null} />);
    expect(screen.getByText('Abra a mesa para mudar as condições.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova condição' })).toBeNull();
  });

  it('before the table stream has its first sync it says the conditions are loading', () => {
    const table = createCharactersStore(VHARN.id, () => undefined);
    const commands = new TableBoardCommandsFake();
    const assets = new AssetsApiFake();
    render(
      <ConditionCatalogPage link={{ scope: { campaignId: VHARN.id }, table, commands, assets }} />,
    );
    expect(screen.getByText('Carregando as condições…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Buscar condição')).toBeNull();
  });

  it('the header says what the page is, with search, "Restaurar padrões" and "Nova condição"', () => {
    renderCatalog(defaultDefinitions());
    expect(
      screen.getByText('As condições que a mesa usa. Cada mudança vale na hora para todos.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Buscar condição')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restaurar padrões' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Nova condição' })).toBeEnabled();
  });

  it("shows the table's conditions as cards by nature, the sheet closed", () => {
    renderCatalog([ENVENENADO, CAIDO]);
    expect(screen.getByRole('region', { name: 'Prejudiciais' })).toBeInTheDocument();
    expect(cardNames()).toEqual(['Editar Caído', 'Editar Envenenado']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a condition defined elsewhere joins the cards live', () => {
    const { confirm } = renderCatalog([ENVENENADO]);
    confirm({ type: 'conditionDefined', payload: { definition: CAIDO } });
    expect(cardNames()).toEqual(['Editar Caído', 'Editar Envenenado']);
  });

  it('the search keeps only the cards whose name holds the text', async () => {
    renderCatalog(defaultDefinitions());
    await search('ce');
    expect(cardNames()).toEqual(['Editar Concentrando', 'Editar Cego']);
  });

  it('the search ignores case and accents: "CAIDO" finds Caído', async () => {
    renderCatalog([ENVENENADO, CAIDO]);
    await search('CAIDO');
    expect(cardNames()).toEqual(['Editar Caído']);
  });

  it('a search that matches nothing says "Nenhuma condição com esse nome."', async () => {
    renderCatalog([ENVENENADO, CAIDO]);
    await search('xyz');
    expect(screen.getByText('Nenhuma condição com esse nome.')).toBeInTheDocument();
    expect(cardNames()).toEqual([]);
  });

  it('an empty table says "A mesa não tem condições."', () => {
    renderCatalog([]);
    expect(screen.getByText('A mesa não tem condições.')).toBeInTheDocument();
  });

  it('a card opens its condition in the sheet', async () => {
    renderCatalog([ENVENENADO, CAIDO]);
    await userEvent.click(conditionCard('Envenenado'));
    const sheet = editorSheet('Editar Envenenado');
    expect(within(sheet).getByLabelText('Nome')).toHaveValue('Envenenado');
  });

  it('"Excluir" in the sheet opens its confirmation', async () => {
    renderCatalog([ENVENENADO]);
    await userEvent.click(conditionCard('Envenenado'));
    await userEvent.click(
      within(editorSheet('Editar Envenenado')).getByRole('button', { name: 'Excluir Envenenado' }),
    );
    expect(
      await screen.findByRole('alertdialog', { name: 'Excluir Envenenado?' }),
    ).toBeInTheDocument();
  });
});
