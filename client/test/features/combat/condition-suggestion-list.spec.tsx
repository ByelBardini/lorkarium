import { fireEvent, render, screen } from '@testing-library/react';
import type { ConditionDefinitionDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { ConditionSuggestionList } from '@/features/combat/condition-suggestion-list';

const ENVENENADO: ConditionDefinitionDto = {
  id: 'c-1',
  name: 'Envenenado',
  tone: 'harm',
  icon: 'skull',
  color: null,
  look: null,
  description: 'Desvantagem em ataques.',
  maxStacks: null,
};
const CAIDO: ConditionDefinitionDto = { ...ENVENENADO, id: 'c-2', name: 'Caído', description: '' };

type ListOptions = Readonly<{ active?: number; onKeyDown?: (key: string) => void }>;

function renderList({ active = 0, onKeyDown }: ListOptions = {}): void {
  render(
    <ConditionSuggestionList
      id="list"
      suggestions={[ENVENENADO, CAIDO]}
      active={active}
      onTake={() => undefined}
      onKeyDown={onKeyDown && ((event) => onKeyDown(event.key))}
    />,
  );
}

describe('ConditionSuggestionList', () => {
  it('a described option shows its description on one line and is named by the name alone', () => {
    renderList();
    const option = screen.getByRole('option', { name: 'Envenenado' });
    expect(option).toHaveTextContent('EnvenenadoDesvantagem em ataques.');
    expect(screen.getByText('Desvantagem em ataques.')).toHaveClass('truncate');
  });

  it('a described option is described by its description', () => {
    renderList();
    expect(screen.getByRole('option', { name: 'Envenenado' })).toHaveAccessibleDescription(
      'Desvantagem em ataques.',
    );
  });

  it('an option without description has no second line nor aria-describedby', () => {
    renderList();
    const option = screen.getByRole('option', { name: 'Caído' });
    expect(option.textContent).toBe('Caído');
    expect(option).not.toHaveAttribute('aria-describedby');
  });

  it('without onKeyDown the listbox is not focusable and leaves the active option to its field', () => {
    renderList();
    const listbox = screen.getByRole('listbox', { name: 'Condições da mesa' });
    expect(listbox).not.toHaveAttribute('tabindex');
    expect(listbox).not.toHaveAttribute('aria-activedescendant');
  });

  it('with onKeyDown the listbox takes the focus, points at the active option and reads the keys', () => {
    const keys: string[] = [];
    renderList({ active: 1, onKeyDown: (key) => keys.push(key) });
    const listbox = screen.getByRole('listbox', { name: 'Condições da mesa' });
    expect(listbox).toHaveAttribute('tabindex', '0');
    expect(listbox).toHaveAttribute('aria-activedescendant', 'list-1');
    expect(document.getElementById('list-1')).toHaveAccessibleName('Caído');
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(keys).toEqual(['ArrowDown']);
  });

  it('with onKeyDown and nothing active, no aria-activedescendant', () => {
    renderList({ active: -1, onKeyDown: () => undefined });
    expect(screen.getByRole('listbox')).not.toHaveAttribute('aria-activedescendant');
  });
});

describe('ConditionSuggestionList stacks', () => {
  it('a stacking option shows "até ×5", hidden from its accessible name', () => {
    render(
      <ConditionSuggestionList
        id="list"
        suggestions={[{ ...CAIDO, name: 'Sangrando', maxStacks: 5 }]}
        active={0}
        onTake={() => undefined}
      />,
    );
    const option = screen.getByRole('option', { name: 'Sangrando' });
    expect(option).toHaveTextContent('Sangrandoaté ×5');
    expect(screen.getByText('até ×5')).toHaveAttribute('aria-hidden', 'true');
  });

  it('an option that does not stack shows no "até"', () => {
    renderList();
    expect(screen.getByRole('option', { name: 'Caído' })).not.toHaveTextContent('até');
  });
});
