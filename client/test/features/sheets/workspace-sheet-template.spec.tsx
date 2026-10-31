import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { codeTextOf, replaceCode } from '../../support/code-editor-input';
import { masterLibrary } from '../../support/library-fixtures';
import { openLibrary } from '../../support/library-harness';
import { treeItem } from '../../support/library-tree';
import { libraryChanged } from '../../support/scene-tab-fixtures';
import { TORMENTA_TEMPLATE_ID } from '../../support/sheet-fixtures';
import { tormentaSummary } from '../../support/sheet-template-fixtures';

const TAB_TITLE = 'Modelo · Ficha Tormenta';
let current: TestDependencies | null = null;

afterEach(() => {
  act(() => current?.documentWorkspace.getState().clear());
  current = null;
});

// The master picks Ficha Tormenta in the library, types, and takes it to a room tab.
async function tormentaInTab(): Promise<TestDependencies> {
  const deps = testDependencies();
  current = deps;
  deps.libraryApi.answer('list', {
    ok: true,
    value: masterLibrary({ sheetTemplates: [tormentaSummary()] }),
  });
  await openLibrary(deps);
  await userEvent.click(treeItem('Ficha Tormenta'));
  await screen.findByRole('textbox', { name: 'HTML do modelo' });
  replaceCode('HTML do modelo', '<p>meu</p>');
  await userEvent.click(screen.getByRole('button', { name: 'Abrir modelo em aba' }));
  await waitFor(() => expect(screen.queryByRole('tree')).not.toBeInTheDocument());
  await screen.findByRole('region', { name: 'Editor do modelo' });
  return deps;
}

describe('a sheet template in a room tab', () => {
  it('"Abrir modelo em aba" takes the unsaved code to the room tab, "Modelo · <nome>"', async () => {
    await tormentaInTab();
    expect(screen.getByRole('tab', { name: TAB_TITLE })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(codeTextOf('HTML do modelo')).toBe('<p>meu</p>'));
    expect(screen.getByRole('button', { name: 'Abrir modelo em janela' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar modelo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir modelo em aba' })).toBeNull();
  });

  it('closing the tab with unsaved code asks; "Continuar editando" keeps it, "Descartar" closes', async () => {
    await tormentaInTab();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar modelo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar editando' }));
    expect(screen.getByRole('tab', { name: TAB_TITLE })).toBeInTheDocument();
    expect(codeTextOf('HTML do modelo')).toBe('<p>meu</p>');
    await userEvent.click(screen.getByRole('button', { name: `Fechar ${TAB_TITLE}` }));
    expect(
      await screen.findByRole('alertdialog', { name: 'Descartar o código não salvo?' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(screen.queryByRole('tab', { name: TAB_TITLE })).toBeNull());
  });

  it('a saved template closes without asking', async () => {
    const deps = await tormentaInTab();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Salvo.');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar modelo' }));
    await waitFor(() => expect(deps.documentWorkspace.getState().templates).toEqual([]));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('the window opens the editor on its own page with the same unsaved code', async () => {
    const deps = await tormentaInTab();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir modelo em janela' }));
    expect(deps.chatWindowHost.calls[0]?.url).toBe('/chat-window.html?panel=sheet-template');
    const popup = deps.chatWindowHost.last();
    act(() => popup.load());
    const body = within(popup.document.body);
    await body.findByRole('region', { name: 'Editor do modelo' });
    expect(screen.getByText('Modelo aberto em outra janela.')).toBeInTheDocument();
    expect(body.queryByRole('button', { name: 'Fechar modelo' })).toBeNull();
    expect(deps.documentWorkspace.getState().templates[0]?.draft.getState().draft.html).toBe(
      '<p>meu</p>',
    );
  });

  it('a template deleted while open leaves its tab and says why', async () => {
    const deps = await tormentaInTab();
    deps.sheetTemplatesApi.templates.delete(TORMENTA_TEMPLATE_ID);
    act(() => deps.tableSessionApi.emit({ kind: 'libraryChanged', event: libraryChanged() }));
    expect(
      await screen.findByText('O modelo Ficha Tormenta foi fechado: ele foi excluído.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: TAB_TITLE })).toBeNull();
  });
});
