import type { ConditionDefinitionDto } from '@lorkarium/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConditionCardGrid } from '@/features/conditions/condition-card-grid';
import { conditionDefinition, defaultDefinitions } from './condition-catalog-harness';

const ENVENENADO = conditionDefinition({ name: 'Envenenado', description: 'Desvantagem.' });
const CAIDO = conditionDefinition({ name: 'Caído' });

// Plays the page: keeps each condition a card opened.
class OpenRecorder {
  readonly opened: ConditionDefinitionDto[] = [];

  open = (definition: ConditionDefinitionDto): void => {
    this.opened.push(definition);
  };
}

describe('ConditionCardGrid', () => {
  let page: OpenRecorder;

  beforeEach(() => {
    page = new OpenRecorder();
  });

  function renderGrid(
    shown: readonly ConditionDefinitionDto[],
    total: number = shown.length,
  ): void {
    render(<ConditionCardGrid shown={shown} total={total} onOpen={page.open} />);
  }

  function cardNamesIn(group: string): string[] {
    const section = screen.getByRole('region', { name: group });
    return within(section)
      .getAllByRole('button')
      .map((card) => card.getAttribute('aria-label') ?? '');
  }

  function card(name: string): HTMLElement {
    return screen.getByRole('button', { name: `Editar ${name}` });
  }

  it('one section per nature, in the order Benéficas, Incapacitantes, Prejudiciais', () => {
    renderGrid(defaultDefinitions().reverse());
    const titles = screen.getAllByRole('heading', { level: 2 }).map((title) => title.textContent);
    expect(titles).toEqual(['Benéficas · 3', 'Incapacitantes · 2', 'Prejudiciais · 6']);
  });

  it('each section holds the cards of its nature in the order given, named "Editar X"', () => {
    const [abencoado, concentrando] = defaultDefinitions();
    if (!abencoado || !concentrando) throw new Error('expected the defaults to start Benéficas');
    renderGrid([concentrando, abencoado, ENVENENADO]);
    expect(cardNamesIn('Benéficas')).toEqual(['Editar Concentrando', 'Editar Abençoado']);
    expect(cardNamesIn('Prejudiciais')).toEqual(['Editar Envenenado']);
  });

  it('a nature with no condition has no section', () => {
    renderGrid([ENVENENADO]);
    expect(screen.queryByRole('region', { name: 'Benéficas' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Incapacitantes' })).toBeNull();
  });

  it('a card shows its description, clamped at 3 lines', () => {
    renderGrid([ENVENENADO]);
    expect(within(card('Envenenado')).getByText('Desvantagem.')).toHaveClass('line-clamp-3');
  });

  it('a card without description says "Sem descrição"', () => {
    renderGrid([CAIDO]);
    expect(card('Caído')).toHaveTextContent('CaídoSem descrição');
  });

  it.each([
    [{ look: 'invisible' as const }, 'Translúcido no token'],
    [{ look: 'unconscious' as const }, 'Desacordado no token'],
    [{ maxStacks: 5 }, 'Acumula até ×5'],
    [{ look: 'invisible' as const, maxStacks: 99 }, 'Translúcido no token · Acumula até ×99'],
  ])('a card with %o reads the traits "%s"', (overrides, traits) => {
    renderGrid([conditionDefinition({ name: 'Caído', ...overrides })]);
    expect(card('Caído')).toHaveTextContent(`Caído${traits}Sem descrição`);
  });

  it('clicking a card opens that condition', async () => {
    renderGrid([CAIDO, ENVENENADO]);
    await userEvent.click(card('Envenenado'));
    expect(page.opened).toEqual([ENVENENADO]);
  });

  it('an empty table says "A mesa não tem condições." and shows no section', () => {
    renderGrid([], 0);
    expect(screen.getByText('A mesa não tem condições.')).toBeInTheDocument();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('a search that left nothing says "Nenhuma condição com esse nome."', () => {
    renderGrid([], 2);
    expect(screen.getByText('Nenhuma condição com esse nome.')).toBeInTheDocument();
    expect(screen.queryByText('A mesa não tem condições.')).toBeNull();
  });
});
