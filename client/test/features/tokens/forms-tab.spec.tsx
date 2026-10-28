import type { TokenDto, TokenFormDto } from '@lorkarium/contracts';
import { cell } from '@lorkarium/game-core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  TokenDialog,
  type TokenDialogTab,
  type TokenDialogViewer,
} from '@/features/tokens/token-dialog';
import { AssetsApiFake, LYRA_PORTRAIT } from '../../support/assets-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { BIA_AT_TABLE, lyra, VHARN_GRID } from '../../support/table-session-fixtures';

const DWARF_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const WOLF_ID = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const DWARF: TokenFormDto = {
  id: DWARF_ID,
  name: 'Anão',
  imageAssetId: null,
  width: 1,
  height: 1,
  frame: 'square',
};
const WOLF: TokenFormDto = {
  id: WOLF_ID,
  name: 'Lobo atroz',
  imageAssetId: null,
  width: 2,
  height: 2,
  frame: 'round',
};
const SHAPESHIFTER = lyra({ forms: [DWARF, WOLF], activeFormId: DWARF_ID });

const BIA_EDITS: TokenDialogViewer = {
  mode: 'player',
  userId: BIA_AT_TABLE.userId,
  canDelete: false,
  canEdit: true,
};

let commands: TableBoardCommandsFake;

beforeEach(() => {
  commands = new TableBoardCommandsFake();
});

type Opened = Readonly<{ viewer?: TokenDialogViewer; initialTab?: TokenDialogTab }>;

function renderDialog(token: TokenDto | null, { viewer, initialTab = 'forms' }: Opened = {}): void {
  render(
    <TokenDialog
      scope={VHARN_GRID}
      token={token}
      placeAt={cell(9, 5)}
      layer="tokens"
      players={[]}
      commands={commands}
      assets={new AssetsApiFake()}
      distance={{ cellDistance: 1.5, cellUnit: 'm' }}
      connected
      viewer={viewer}
      initialTab={initialTab}
      onClose={() => undefined}
    />,
  );
}

const cards = (): HTMLElement[] =>
  within(screen.getByRole('list', { name: 'Formas do token' })).getAllByRole('button');
function expectCards(...names: readonly string[]): void {
  const shown = cards();
  expect(shown).toHaveLength(names.length);
  names.forEach((name, index) => expect(shown[index]).toHaveAccessibleName(name));
}
const card = (name: RegExp): HTMLElement => screen.getByRole('button', { name });
const press = (name: string | RegExp): Promise<void> =>
  userEvent.click(screen.getByRole('button', { name }));

function sentForms(): unknown {
  const fields = commands.sentAs('updateToken')[0]?.fields;
  return typeof fields === 'object' && fields !== null && 'forms' in fields
    ? fields.forms
    : undefined;
}

describe('FormsTab, the first form', () => {
  it('"Nova forma" on a token without forms creates the base (its look now) and the new one, selected', async () => {
    renderDialog(lyra({ imageAssetId: LYRA_PORTRAIT.id, width: 2, height: 2 }));

    await press(/Nova forma/);

    expect(screen.getByRole('tab', { name: 'Formas 2' })).toHaveAttribute('aria-selected', 'true');
    expectCards('Lyra 2×2 casas · tecla 1 Base', 'Sem nome 2×2 casas · tecla 2', 'Nova forma');
    expect(card(/^Sem nome/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Nome da forma')).toHaveValue('');
  });

  it('naming it and saving sends the base and the new form in order', async () => {
    renderDialog(lyra({ imageAssetId: LYRA_PORTRAIT.id }));
    await press(/Nova forma/);

    await userEvent.type(screen.getByLabelText('Nome da forma'), 'Lobo atroz');
    await press('Grande 2×2');
    await press('Salvar');

    expect(sentForms()).toEqual([
      expect.objectContaining({ name: 'Lyra', imageAssetId: LYRA_PORTRAIT.id, width: 1 }),
      expect.objectContaining({ name: 'Lobo atroz', imageAssetId: null, width: 2, height: 2 }),
    ]);
  });

  it("the base takes the frame the token has now, and the new form the base's", async () => {
    renderDialog(lyra({ frame: 'round' }));
    await press(/Nova forma/);

    await userEvent.type(screen.getByLabelText('Nome da forma'), 'Lobo');
    await press('Salvar');

    expect(sentForms()).toEqual([
      expect.objectContaining({ name: 'Lyra', frame: 'round' }),
      expect.objectContaining({ name: 'Lobo', frame: 'round' }),
    ]);
  });
});

describe('FormsTab, editing a form', () => {
  it('opens the form on the map, with "No mapa" on its card only', () => {
    renderDialog(lyra({ forms: [DWARF, WOLF], activeFormId: WOLF_ID }));

    expect(card(/^Lobo atroz/)).toHaveAttribute('aria-pressed', 'true');
    expect(within(card(/^Lobo atroz/)).getByText('No mapa')).toBeInTheDocument();
    expect(within(card(/^Anão/)).queryByText('No mapa')).toBeNull();
  });

  it('renaming it changes its card and goes in the save', async () => {
    renderDialog(SHAPESHIFTER);
    await userEvent.click(card(/^Lobo atroz/));

    await userEvent.clear(screen.getByLabelText('Nome da forma'));
    await userEvent.type(screen.getByLabelText('Nome da forma'), 'Lobo');
    await press('Salvar');

    expect(card(/^Lobo 2×2/)).toBeInTheDocument();
    expect(sentForms()).toEqual([DWARF, { ...WOLF, name: 'Lobo' }]);
  });

  it('"Borda" chooses square or round for the open form only', async () => {
    renderDialog(SHAPESHIFTER);
    await userEvent.click(card(/^Lobo atroz/));

    expect(screen.getByRole('radio', { name: 'Redonda' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Quadrada' }));
    await press('Salvar');

    expect(sentForms()).toEqual([DWARF, { ...WOLF, frame: 'square' }]);
  });

  it('the size comes from the presets of "Tamanho"', async () => {
    renderDialog(SHAPESHIFTER);
    await userEvent.click(card(/^Lobo atroz/));

    await press('Enorme 3×3');
    await press('Salvar');

    expect(sentForms()).toEqual([DWARF, { ...WOLF, width: 3, height: 3 }]);
  });

  it('"Imagem da forma" uploads the image into the open form', async () => {
    renderDialog(SHAPESHIFTER);
    await userEvent.click(card(/^Lobo atroz/));
    const editor = screen.getByRole('region', { name: 'Forma Lobo atroz' });

    const png = new File([new Uint8Array(4)], 'lobo.png', { type: 'image/png' });
    await userEvent.upload(within(editor).getByLabelText('Arquivo de imagem'), png);
    await press('Salvar');

    expect(sentForms()).toEqual([DWARF, { ...WOLF, imageAssetId: LYRA_PORTRAIT.id }]);
  });

  it('"Tornar base" moves the form to the first place', async () => {
    renderDialog(SHAPESHIFTER);
    await userEvent.click(card(/^Lobo atroz/));

    await press('Tornar base');
    await press('Salvar');

    expect(cards()[0]).toHaveAccessibleName('Lobo atroz 2×2 casas · tecla 1 Base');
    expect(sentForms()).toEqual([WOLF, DWARF]);
  });

  it('"Duplicar" puts a copy after it, open in the editor', async () => {
    renderDialog(SHAPESHIFTER);
    await userEvent.click(card(/^Lobo atroz/));

    await press('Duplicar');

    expectCards(
      'Anão 1×1 casa · tecla 1 Base No mapa',
      'Lobo atroz 2×2 casas · tecla 2',
      'Lobo atroz (cópia) 2×2 casas · tecla 3',
      'Nova forma',
    );
    expect(card(/^Lobo atroz \(cópia\)/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('"Excluir forma" is disabled on the base and removes another form', async () => {
    renderDialog(SHAPESHIFTER);
    expect(screen.getByRole('button', { name: 'Excluir forma' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tornar base' })).toBeDisabled();

    await userEvent.click(card(/^Lobo atroz/));
    await press('Excluir forma');
    await press('Salvar');

    expect(screen.queryByRole('button', { name: /^Lobo atroz/ })).toBeNull();
    expect(sentForms()).toEqual([DWARF]);
  });
});

describe('FormsTab, the limit and the errors', () => {
  const sevenForms = Array.from({ length: 7 }, (_, index) => ({
    ...WOLF,
    id: `1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5${index}`,
    name: `Forma ${index + 1}`,
  }));

  it('the 8th form hides "Nova forma" and disables "Duplicar"', async () => {
    renderDialog(lyra({ forms: sevenForms }));
    expect(screen.getByRole('button', { name: 'Duplicar' })).toBeEnabled();

    await press(/Nova forma/);

    expect(screen.getByRole('tab', { name: 'Formas 8' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nova forma/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Duplicar' })).toBeDisabled();
  });

  it('an empty name marks the form and "Salvar" goes to "Formas" without sending', async () => {
    renderDialog(SHAPESHIFTER);
    await press(/Nova forma/);
    await userEvent.click(screen.getByRole('tab', { name: 'Básico' }));

    await press('Salvar');

    expect(screen.getByRole('tab', { name: 'Formas 3 (com erro)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByLabelText('Nome da forma')).toHaveAccessibleDescription(
      'Dê um nome à forma.',
    );
    expect(card(/^Sem nome.*\(com erro\)$/)).toBeInTheDocument();
    expect(commands.sentAs('updateToken')).toEqual([]);
  });

  it('a save that never touched "Formas" does not send the forms', async () => {
    renderDialog(SHAPESHIFTER, { initialTab: 'basics' });

    await press('Salvar');

    expect(commands.sentAs('updateToken')[0]?.fields).not.toHaveProperty('forms');
  });
});

describe('FormsTab, who sees it', () => {
  it('"Novo token" has no "Formas" and opens on "Básico" even when asked for it', () => {
    renderDialog(null);

    expect(screen.queryByRole('tab', { name: /^Formas/ })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Básico' })).toHaveAttribute('aria-selected', 'true');
  });

  it('the master sees it after "Barras", with the number of forms', () => {
    renderDialog(SHAPESHIFTER, { initialTab: 'basics' });

    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Básico', 'Barras 2', 'Formas 2', 'Visão e luz', 'Aura']);
  });

  it('a player with the key to edit the token sees it', () => {
    renderDialog(SHAPESHIFTER, { viewer: BIA_EDITS });

    expect(screen.getByRole('tab', { name: 'Formas 2' })).toHaveAttribute('aria-selected', 'true');
  });

  it('a player without the key to edit does not see it, and opens on "Básico"', () => {
    renderDialog(SHAPESHIFTER, { viewer: { ...BIA_EDITS, canEdit: false } });

    expect(screen.queryByRole('tab', { name: /^Formas/ })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Básico' })).toHaveAttribute('aria-selected', 'true');
  });
});
