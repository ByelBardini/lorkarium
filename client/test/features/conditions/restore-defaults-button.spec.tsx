import type { ConditionDefinitionDto } from '@lorkarium/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ConditionCatalogLink } from '@/features/conditions/condition-catalog-link';
import { RestoreDefaultsButton } from '@/features/conditions/restore-defaults-button';
import { useCharacters } from '@/stores/characters-store';
import {
  VHARN_TABLE,
  catalogLinkOver,
  conditionDefinition,
  defaultDefinitions,
} from './condition-catalog-harness';

// Plays the page: the button over the table stream's live list.
function RestoreHost({ link }: Readonly<{ link: ConditionCatalogLink }>) {
  const definitions = useCharacters(link.table, (s) => s.conditionDefinitions);
  return <RestoreDefaultsButton definitions={definitions} link={link} />;
}

function renderRestore(definitions: readonly ConditionDefinitionDto[]) {
  const catalog = catalogLinkOver(definitions);
  render(<RestoreHost link={catalog.link} />);
  return catalog;
}

function restoreButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Restaurar padrões' });
}

function withoutCego(): ConditionDefinitionDto[] {
  return defaultDefinitions().filter(({ name }) => name !== 'Cego');
}

describe('RestoreDefaultsButton', () => {
  it('with every default on the list it is disabled and says so to the reader only', () => {
    renderRestore(defaultDefinitions());
    expect(restoreButton()).toBeDisabled();
    expect(restoreButton()).toHaveAccessibleDescription(
      'Todas as condições padrão estão na lista.',
    );
    expect(screen.getByText('Todas as condições padrão estão na lista.')).toHaveClass('sr-only');
  });

  it('a default listed in another case and without accent still counts as there', () => {
    const renamed = defaultDefinitions().map((definition) =>
      definition.name === 'Caído' ? { ...definition, name: 'CAIDO' } : definition,
    );
    renderRestore(renamed);
    expect(restoreButton()).toBeDisabled();
  });

  it('with Cego missing it is enabled and names what comes back, visibly', () => {
    renderRestore(withoutCego());
    expect(restoreButton()).toBeEnabled();
    expect(restoreButton()).toHaveAccessibleDescription('Faltam: Cego.');
    expect(screen.getByText('Faltam: Cego.')).not.toHaveClass('sr-only');
  });

  it('with two missing it names both as a list', () => {
    renderRestore(withoutCego().filter(({ name }) => name !== 'Caído'));
    expect(restoreButton()).toHaveAccessibleDescription('Faltam: Caído e Cego.');
  });

  it('clicking sends one condition:restoreDefaults to the scope; the restored one disables it', async () => {
    const { commands, confirm } = renderRestore(withoutCego());
    await userEvent.click(restoreButton());
    expect(commands.sentAs('restoreDefaultConditions')).toEqual([
      { name: 'restoreDefaultConditions', ...VHARN_TABLE, fields: {} },
    ]);
    confirm({
      type: 'conditionDefaultsRestored',
      payload: { definitions: [conditionDefinition({ name: 'Cego' })] },
    });
    expect(restoreButton()).toBeDisabled();
  });

  it('a refusal says why under the button, visibly', async () => {
    const { commands } = renderRestore(withoutCego());
    commands.answerWith({ ok: false, failure: 'forbidden' });
    await userEvent.click(restoreButton());
    expect(restoreButton()).toHaveAccessibleDescription('Só o mestre pode fazer isso.');
    expect(screen.getByText('Só o mestre pode fazer isso.')).not.toHaveClass('sr-only');
  });
});
