import { completionStatus, currentCompletions, startCompletion } from '@codemirror/autocomplete';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SheetCodeTabs } from '@/features/sheets/sheet-code-tabs';
import type { TemplateDraft } from '@/stores/sheet-template-draft-store';
import { codeTextOf, codeViewOf, replaceCode } from '../../support/code-editor-input';

const EMPTY_MANIFEST = '{\n  "permissions": [],\n  "bars": []\n}';

function EditableTabs({ edits }: Readonly<{ edits: Partial<TemplateDraft>[] }>) {
  const [draft, setDraft] = useState<TemplateDraft>({
    name: 'Ficha de Lork',
    files: [
      { path: 'index.html', content: '<p></p>' },
      { path: 'estilo.css', content: '' },
      { path: 'a.js', content: 'a();' },
    ],
    manifest: EMPTY_MANIFEST,
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

async function openManifest(edits: Partial<TemplateDraft>[] = []) {
  const user = userEvent.setup();
  render(<EditableTabs edits={edits} />);
  await screen.findByRole('textbox', { name: 'Arquivo index.html' });
  await user.click(screen.getByRole('tab', { name: 'Manifesto' }));
  await screen.findByRole('textbox', { name: 'Manifesto do modelo' });
  return edits;
}

describe('SheetCodeTabs manifest tab', () => {
  it('shows the manifest of the draft as JSON without a problem', async () => {
    await openManifest();
    expect(codeTextOf('Manifesto do modelo')).toBe(EMPTY_MANIFEST);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a valid manifest goes to the draft and says nothing', async () => {
    const edits = await openManifest();
    const text =
      '{"permissions":["character:stats"],"bars":[{"label":"HP","color":"ember","max":12}]}';
    replaceCode('Manifesto do modelo', text);
    expect(edits.at(-1)).toEqual({ manifest: text });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('an unknown permission shows the contract message with where it is', async () => {
    await openManifest();
    replaceCode('Manifesto do modelo', '{"permissions":["network"]}');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Manifesto inválido: permissions.0: permission "network"; expected one of character:stats, character:portrait, sheet:images',
    );
  });

  it('a text that is not JSON says so', async () => {
    await openManifest();
    replaceCode('Manifesto do modelo', '{ "permissions": ');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Manifesto inválido: o texto não é um JSON.',
    );
  });
});

describe('SheetCodeTabs suggestions of the SDK', () => {
  // jsdom has no layout: the suggestion box measures the text it sits under.
  const measure = Range.prototype.getClientRects;
  beforeAll(() => {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  });
  afterAll(() => {
    Range.prototype.getClientRects = measure;
  });

  // Writes `text` in the file's field and asks the suggestions at its end, as Ctrl+Space does.
  async function askIn(file: string, text: string) {
    render(<EditableTabs edits={[]} />);
    await screen.findByRole('textbox', { name: 'Arquivo index.html' });
    const tree = screen.getByRole('list', { name: 'Arquivos do modelo' });
    await userEvent.click(within(tree).getByRole('button', { name: file }));
    replaceCode(`Arquivo ${file}`, text);
    const view = codeViewOf(`Arquivo ${file}`);
    act(() => {
      view.dispatch({ selection: { anchor: text.length } });
      startCompletion(view);
    });
    return view;
  }

  it('a JS file suggests the bar calls after "lorkarium.bars."', async () => {
    const view = await askIn('a.js', 'lorkarium.bars.');
    await waitFor(() =>
      expect(currentCompletions(view.state).map(({ label }) => label)).toEqual([
        'list',
        'get',
        'adjust',
        'spend',
      ]),
    );
  });

  it('an HTML file suggests nothing', async () => {
    const view = await askIn('index.html', 'lorkarium.bars.');
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(completionStatus(view.state)).toBeNull();
  });
});
