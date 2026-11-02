import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { ConditionCatalogLink } from '@/features/conditions/condition-catalog-link';
import { DeleteConditionConfirm } from '@/features/conditions/delete-condition-confirm';
import { VHARN_TABLE, catalogLinkOver, conditionDefinition } from './condition-catalog-harness';

const CEGO = conditionDefinition({ name: 'Cego' });

// Plays the page: "Excluir Cego" opens the confirmation; `closes` counts its onClose.
class DeleteOpener {
  closes = 0;

  close = (): void => {
    this.closes += 1;
  };
}

function DeleteHost({
  link,
  opener,
}: Readonly<{ link: ConditionCatalogLink; opener: DeleteOpener }>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Excluir Cego
      </button>
      {open && (
        <DeleteConditionConfirm
          definition={CEGO}
          link={link}
          onClose={() => {
            opener.close();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

async function openDelete(usage: number, failure?: 'token_not_found') {
  const catalog = catalogLinkOver([CEGO]);
  catalog.commands.answerUsageWith(usage);
  if (failure) catalog.commands.answerWith({ ok: false, failure });
  const opener = new DeleteOpener();
  render(<DeleteHost link={catalog.link} opener={opener} />);
  await userEvent.click(screen.getByRole('button', { name: 'Excluir Cego' }));
  const dialog = await screen.findByRole('alertdialog', { name: 'Excluir Cego?' });
  return { ...catalog, opener, dialog };
}

describe('DeleteConditionConfirm', () => {
  it('opening asks the server once how many tokens hold the condition', async () => {
    const { commands, dialog } = await openDelete(2);
    await within(dialog).findByText('Está em 2 tokens. Ela sai de todos.');
    expect(commands.sentAs('conditionUsage').map(({ fields }) => fields)).toEqual([
      { conditionId: CEGO.id },
    ]);
  });

  it('while the count is asked it reads "Contando os tokens com essa condição…"', async () => {
    const catalog = catalogLinkOver([CEGO]);
    catalog.commands.hold();
    render(<DeleteHost link={catalog.link} opener={new DeleteOpener()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Excluir Cego' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Excluir Cego?' });
    expect(dialog).toHaveTextContent('Contando os tokens com essa condição…');
  });

  it.each([
    [2, 'Está em 2 tokens. Ela sai de todos.'],
    [1, 'Está em 1 token.'],
    [0, 'Nenhum token tem essa condição.'],
  ])('a condition on %i tokens reads "%s"', async (usage, text) => {
    const { dialog } = await openDelete(usage);
    expect(await within(dialog).findByText(text)).toBeInTheDocument();
  });

  it('a refused count says why in place of the count', async () => {
    const { dialog } = await openDelete(0, 'token_not_found');
    expect(await within(dialog).findByText('Essa condição não está mais na lista.')).toBeVisible();
  });

  it('"Excluir" sends condition:deleteDefinition with the id and closes', async () => {
    const { commands, opener, dialog } = await openDelete(2);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    expect(commands.sentAs('deleteConditionDefinition')).toEqual([
      {
        name: 'deleteConditionDefinition',
        ...VHARN_TABLE,
        fields: { conditionId: CEGO.id },
      },
    ]);
    expect(opener.closes).toBe(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('"Manter" closes without a command and gives the focus back to "Excluir Cego"', async () => {
    const { commands, opener, dialog } = await openDelete(2);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Manter' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(opener.closes).toBe(1);
    expect(commands.sentAs('deleteConditionDefinition')).toEqual([]);
    expect(screen.getByRole('button', { name: 'Excluir Cego' })).toHaveFocus();
  });

  it('a refused deletion stays in the dialog, says why and lets it be tried again', async () => {
    const { commands, opener, dialog } = await openDelete(2);
    commands.answerWith({ ok: false, failure: 'forbidden' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Só o mestre pode fazer isso.');
    expect(within(dialog).getByRole('button', { name: 'Excluir' })).toBeEnabled();
    expect(opener.closes).toBe(0);
  });
});
