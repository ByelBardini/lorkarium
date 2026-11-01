import { SHEET_TEMPLATE_FILE_MAX_BYTES } from '@lorkarium/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { sheetTemplateFileText } from '@/lib/sheet-template-file';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ATO_1, masterLibrary } from '../../support/library-fixtures';
import { openLibrary } from '../../support/library-harness';
import { libraryTree, openTreeMenu, treeItem } from '../../support/library-tree';
import {
  ClaimedSizeFileFake,
  lksheetFile,
  tormentaFileContent,
} from '../../support/sheet-template-file-fakes';
import { NEW_TEMPLATE_ID, tormentaSummary } from '../../support/sheet-template-fixtures';

const NOT_A_FILE = 'Este arquivo não é um modelo de ficha (.lksheet).';

function fileInput(): HTMLElement {
  return screen.getByLabelText('Arquivo de modelo de ficha');
}

function importDialog(): HTMLElement {
  return screen.getByRole('dialog', { name: 'Importar modelo de ficha' });
}

/** The library shows the imported template once the list is read again after the create. */
function listsTheImport(deps: TestDependencies, folderId: string | null = null): void {
  deps.libraryApi.answer('list', {
    ok: true,
    value: masterLibrary({ sheetTemplates: [tormentaSummary({ id: NEW_TEMPLATE_ID, folderId })] }),
  });
}

async function importFromCreateMenu(file: File = lksheetFile()): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Criar item' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Importar modelo de ficha' }));
  await userEvent.upload(fileInput(), file);
}

async function confirmImport(): Promise<void> {
  await userEvent.click(within(importDialog()).getByRole('button', { name: 'Importar' }));
}

describe('importing a sheet template file into the library', () => {
  it('"Criar item ▸ Importar modelo de ficha" creates the file’s code at the root and opens its editor', async () => {
    const deps = testDependencies();
    await openLibrary(deps);
    await importFromCreateMenu();
    const dialog = importDialog();
    expect(within(dialog).getByRole('textbox', { name: 'Nome do modelo' })).toHaveValue(
      'Ficha Tormenta',
    );
    expect(within(dialog).getByLabelText('Tamanho do código')).toHaveTextContent(
      '0,1 KiB de 512 KiB',
    );
    expect(dialog).toHaveAccessibleDescription(
      'O código foi escrito por outra pessoa e roda isolado, sem acesso à rede nem à sua conta.',
    );
    listsTheImport(deps);
    await confirmImport();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Importar modelo de ficha' })).toBeNull(),
    );
    expect(deps.sheetTemplatesApi.creates.map(({ input }) => input)).toEqual([
      { folderId: null, ...tormentaFileContent() },
    ]);
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Editor do modelo' })).toBeInTheDocument(),
    );
    expect(treeItem('Ficha Tormenta')).toHaveAttribute('aria-selected', 'true');
  });

  it('"Importar modelo aqui" on a folder creates the template in that folder', async () => {
    const deps = testDependencies();
    await openLibrary(deps);
    const menu = await openTreeMenu(treeItem('Ato 1'));
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Importar modelo aqui' }));
    await userEvent.upload(fileInput(), lksheetFile());
    listsTheImport(deps, ATO_1.id);
    await confirmImport();
    await waitFor(() => expect(deps.sheetTemplatesApi.creates).toHaveLength(1));
    expect(deps.sheetTemplatesApi.creates[0]?.input.folderId).toBe(ATO_1.id);
  });

  it('"Importar modelo de ficha" on the tree area creates the template at the root', async () => {
    const deps = testDependencies();
    await openLibrary(deps);
    const area = libraryTree().parentElement ?? libraryTree();
    const menu = await openTreeMenu(area);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Importar modelo de ficha' }));
    await userEvent.upload(fileInput(), lksheetFile());
    await confirmImport();
    await waitFor(() => expect(deps.sheetTemplatesApi.creates).toHaveLength(1));
    expect(deps.sheetTemplatesApi.creates[0]?.input.folderId).toBeNull();
  });

  it('the name typed in the dialog is the one created', async () => {
    const deps = testDependencies();
    await openLibrary(deps);
    await importFromCreateMenu();
    const name = within(importDialog()).getByRole('textbox', { name: 'Nome do modelo' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Tormenta (cópia)');
    await confirmImport();
    await waitFor(() => expect(deps.sheetTemplatesApi.creates).toHaveLength(1));
    expect(deps.sheetTemplatesApi.creates[0]?.input.name).toBe('Tormenta (cópia)');
  });

  it('a blank name blocks "Importar"', async () => {
    await openLibrary(testDependencies());
    await importFromCreateMenu();
    const dialog = importDialog();
    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Nome do modelo' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome do modelo' }), '   ');
    expect(within(dialog).getByRole('button', { name: 'Importar' })).toBeDisabled();
  });

  it('"Cancelar" closes the dialog and creates nothing', async () => {
    const deps = testDependencies();
    await openLibrary(deps);
    await importFromCreateMenu();
    await userEvent.click(within(importDialog()).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog', { name: 'Importar modelo de ficha' })).toBeNull();
    expect(deps.sheetTemplatesApi.creates).toEqual([]);
  });

  it('the same file picked again after "Cancelar" opens the dialog again', async () => {
    await openLibrary(testDependencies());
    const file = lksheetFile();
    await importFromCreateMenu(file);
    await userEvent.click(within(importDialog()).getByRole('button', { name: 'Cancelar' }));
    await importFromCreateMenu(file);
    expect(await screen.findByRole('dialog', { name: 'Importar modelo de ficha' })).toBeVisible();
  });

  it('a file that is not JSON is refused in an alert, with no dialog', async () => {
    const deps = testDependencies();
    await openLibrary(deps);
    await importFromCreateMenu(lksheetFile('{ "format": "lorkarium.sheet-'));
    expect(await screen.findByRole('alert')).toHaveTextContent(NOT_A_FILE);
    expect(screen.queryByRole('dialog', { name: 'Importar modelo de ficha' })).toBeNull();
    expect(deps.sheetTemplatesApi.creates).toEqual([]);
  });

  it('a file of a newer format version says it was made by a newer Lorkarium', async () => {
    await openLibrary(testDependencies());
    const newer = { ...JSON.parse(sheetTemplateFileText(tormentaFileContent())), formatVersion: 2 };
    await importFromCreateMenu(lksheetFile(JSON.stringify(newer)));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este arquivo foi feito numa versão mais nova do Lorkarium.',
    );
    expect(screen.queryByRole('dialog', { name: 'Importar modelo de ficha' })).toBeNull();
  });

  it('a file whose code passes 512 KiB is refused by the budget', async () => {
    await openLibrary(testDependencies());
    const html = 'a'.repeat(512 * 1024 + 1);
    await importFromCreateMenu(
      lksheetFile(sheetTemplateFileText({ ...tormentaFileContent(), html })),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/passa de 512 KiB/u);
    expect(screen.queryByRole('dialog', { name: 'Importar modelo de ficha' })).toBeNull();
  });

  it('a file over 2 MiB is refused without its text being read', async () => {
    await openLibrary(testDependencies());
    const file = new ClaimedSizeFileFake(SHEET_TEMPLATE_FILE_MAX_BYTES + 1);
    await importFromCreateMenu(file);
    expect(await screen.findByRole('alert')).toHaveTextContent(/passa de 512 KiB/u);
    expect(file.textReads).toBe(0);
    expect(screen.queryByRole('dialog', { name: 'Importar modelo de ficha' })).toBeNull();
  });

  it('a file of exactly 2 MiB is still read', async () => {
    await openLibrary(testDependencies());
    const file = new ClaimedSizeFileFake(SHEET_TEMPLATE_FILE_MAX_BYTES);
    await importFromCreateMenu(file);
    await waitFor(() => expect(file.textReads).toBe(1));
  });

  it('a create the server refuses shows why inside the dialog, which stays open', async () => {
    const deps = testDependencies();
    deps.sheetTemplatesApi.answer = { ok: false, failure: { kind: 'folder_not_found' } };
    await openLibrary(deps);
    await importFromCreateMenu();
    await confirmImport();
    expect(await within(importDialog()).findByRole('alert')).toHaveTextContent(
      'A pasta não existe mais. Recarregue a biblioteca.',
    );
    expect(within(importDialog()).getByRole('button', { name: 'Importar' })).toBeEnabled();
  });

  it('a later refusal of another action does not bring back a finished import', async () => {
    const deps = testDependencies();
    await openLibrary(deps);
    await importFromCreateMenu();
    listsTheImport(deps);
    await confirmImport();
    await screen.findByRole('region', { name: 'Editor do modelo' });
    deps.sheetTemplatesApi.answer = { ok: false, failure: { kind: 'in_use' } };
    const menu = await openTreeMenu(treeItem('Ficha Tormenta'));
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Excluir modelo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(deps.sheetTemplatesApi.removals).toHaveLength(1));
    expect(await screen.findByText(/ligado a fichas/u)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Importar modelo de ficha' })).toBeNull();
  });
});
