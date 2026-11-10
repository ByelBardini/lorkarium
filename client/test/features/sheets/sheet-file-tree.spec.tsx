import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SheetCodeTabs } from '@/features/sheets/sheet-code-tabs';
import type { TemplateDraft } from '@/stores/sheet-template-draft-store';
import { codeTextOf, replaceCode } from '../../support/code-editor-input';

// The file tree is drawn by the code tabs, as the editor shows it.
function EditableTabs({ edits }: Readonly<{ edits: Partial<TemplateDraft>[] }>) {
  const [draft, setDraft] = useState<TemplateDraft>({
    name: 'Ficha de Lork',
    files: [
      { path: 'index.html', content: '<p></p>' },
      { path: 'estilo.css', content: '' },
      { path: 'a.js', content: 'a();' },
    ],
    manifest: '{}',
  });
  return (
    <SheetCodeTabs
      draft={draft}
      onEdit={(changes) => {
        edits.push(changes);
        setDraft((current) => ({ ...current, ...changes }));
      }}
    />
  );
}

function filesShown(): string[] {
  const list = screen.getByRole('list', { name: 'Arquivos do modelo' });
  return within(list)
    .getAllByRole('button')
    .map((button) => button.textContent ?? '');
}

function lastFiles(edits: Partial<TemplateDraft>[]): string[] | undefined {
  return edits.at(-1)?.files?.map(({ path }) => path);
}

async function openFiles(edits: Partial<TemplateDraft>[] = []) {
  const user = userEvent.setup();
  render(<EditableTabs edits={edits} />);
  await screen.findByRole('textbox', { name: 'Arquivo index.html' });
  const pick = (path: string) =>
    user.click(
      within(screen.getByRole('list', { name: 'Arquivos do modelo' })).getByRole('button', {
        name: path,
      }),
    );
  return { user, edits, pick };
}

describe('SheetCodeTabs file tree', () => {
  it('lists the files in order and opens index.html first', async () => {
    await openFiles();
    expect(filesShown()).toEqual(['index.html', 'estilo.css', 'a.js']);
    expect(screen.getByRole('button', { name: 'index.html' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(codeTextOf('Arquivo index.html')).toBe('<p></p>');
  });

  it('creates a page in a folder at the end, empty and open', async () => {
    const { user, edits } = await openFiles();
    await user.click(screen.getByRole('button', { name: 'Novo arquivo' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Caminho do novo arquivo' }),
      'paginas/perfil.html',
    );
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(lastFiles(edits)).toEqual(['index.html', 'estilo.css', 'a.js', 'paginas/perfil.html']);
    expect(
      await screen.findByRole('textbox', { name: 'Arquivo paginas/perfil.html' }),
    ).toBeInTheDocument();
    expect(codeTextOf('Arquivo paginas/perfil.html')).toBe('');
  });

  it('a path the contract refuses or one already taken is said and nothing changes', async () => {
    const { user, edits } = await openFiles();
    await user.click(screen.getByRole('button', { name: 'Novo arquivo' }));
    const field = screen.getByRole('textbox', { name: 'Caminho do novo arquivo' });
    await user.type(field, '../fora.js');
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Caminho inválido');
    await user.clear(field);
    await user.type(field, 'A.js');
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Já existe um arquivo com esse caminho.');
    expect(edits).toEqual([]);
  });

  it('renames the open file in place, keeping its text', async () => {
    const { user, edits, pick } = await openFiles();
    await pick('a.js');
    await user.click(screen.getByRole('button', { name: 'Renomear arquivo' }));
    const field = screen.getByRole('textbox', { name: 'Novo caminho do arquivo' });
    await user.clear(field);
    await user.type(field, 'scripts/a.js');
    await user.click(screen.getByRole('button', { name: 'Renomear' }));
    expect(edits.at(-1)?.files?.[2]).toEqual({ path: 'scripts/a.js', content: 'a();' });
    expect(
      await screen.findByRole('textbox', { name: 'Arquivo scripts/a.js' }),
    ).toBeInTheDocument();
  });

  it('index.html is never renamed nor removed', async () => {
    await openFiles();
    expect(screen.getByRole('button', { name: 'Renomear arquivo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apagar arquivo' })).toBeDisabled();
  });

  it('removes the open file and goes back to index.html', async () => {
    const { user, edits, pick } = await openFiles();
    await pick('estilo.css');
    await user.click(screen.getByRole('button', { name: 'Apagar arquivo' }));
    expect(lastFiles(edits)).toEqual(['index.html', 'a.js']);
    expect(filesShown()).toEqual(['index.html', 'a.js']);
    expect(screen.getByRole('button', { name: 'index.html' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('moves the open file up and down, held at the ends', async () => {
    const { user, edits, pick } = await openFiles();
    await pick('a.js');
    await user.click(screen.getByRole('button', { name: 'Subir arquivo' }));
    expect(lastFiles(edits)).toEqual(['index.html', 'a.js', 'estilo.css']);
    await user.click(screen.getByRole('button', { name: 'Subir arquivo' }));
    await user.click(screen.getByRole('button', { name: 'Subir arquivo' }));
    expect(lastFiles(edits)).toEqual(['a.js', 'index.html', 'estilo.css']);
    await user.click(screen.getByRole('button', { name: 'Descer arquivo' }));
    expect(filesShown()).toEqual(['index.html', 'a.js', 'estilo.css']);
  });

  it('typing in a file changes only that file', async () => {
    const { edits, pick } = await openFiles();
    await pick('a.js');
    replaceCode('Arquivo a.js', 'b();');
    expect(edits.at(-1)?.files).toEqual([
      { path: 'index.html', content: '<p></p>' },
      { path: 'estilo.css', content: '' },
      { path: 'a.js', content: 'b();' },
    ]);
  });
});
