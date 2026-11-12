import type { HexColorDto } from '@lorkarium/contracts';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  CustomColorLocksContext,
  type CustomColorLocks,
  type CustomColorScope,
} from '@/components/color-picker/custom-color-locks';
import { CustomColorTile } from '@/components/color-picker/custom-color-tile';
import { SavedColorsProvider } from '@/components/color-picker/saved-colors-context';
import { fullSavedColors, SavedColorsApiFake } from '../../support/saved-colors-api-fake';

const OFFLINE = { ok: false, failure: { kind: 'offline' } } as const;
const LOW_CONTRAST = /pouco contraste/i;

type TileOptions = Readonly<{
  value?: string | null;
  disabled?: boolean;
  legibleOn?: HexColorDto;
}>;

describe('CustomColorTile', () => {
  let api: SavedColorsApiFake;
  let onPick: Mock<(color: HexColorDto) => void>;
  let user: UserEvent;

  beforeEach(() => {
    api = new SavedColorsApiFake();
    onPick = vi.fn();
    user = userEvent.setup();
  });

  function renderTile({ value = null, disabled, legibleOn }: TileOptions = {}): void {
    render(
      <SavedColorsProvider api={api} userId="bia">
        <CustomColorTile value={value} onPick={onPick} disabled={disabled} legibleOn={legibleOn} />
      </SavedColorsProvider>,
    );
  }

  async function openPanel(name = 'Cor personalizada'): Promise<void> {
    await user.click(screen.getByRole('button', { name }));
    await screen.findByRole('dialog');
  }

  async function typeCode(typed: string): Promise<void> {
    const code = screen.getByLabelText('Código da cor');
    await user.clear(code);
    if (typed !== '') await user.type(code, typed);
  }

  const button = (name: string | RegExp): HTMLElement => screen.getByRole('button', { name });

  it('with no custom color the tile is named alone', () => {
    renderTile();

    expect(button('Cor personalizada')).toBeInTheDocument();
  });

  it.each(['gold', null, undefined])('a value of %s that is no hex marks nothing', (value) => {
    renderTile({ value });

    expect(button('Cor personalizada')).toBeInTheDocument();
  });

  it('a hex value names the tile with its code', () => {
    renderTile({ value: '#336699' });

    expect(button('Cor personalizada: #336699')).toBeInTheDocument();
  });

  it('disabled does not open the panel', async () => {
    renderTile({ disabled: true });

    await user.click(screen.getByRole('button', { name: 'Cor personalizada', hidden: true }));

    expect(button('Cor personalizada')).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('typing a code and "Usar cor" picks it once and closes', async () => {
    renderTile();
    await openPanel();

    await typeCode('#336699');
    await user.click(button('Usar cor'));

    expect(onPick.mock.calls).toEqual([['#336699']]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('the short code without # is read as the full color', async () => {
    renderTile();
    await openPanel();

    await typeCode('ABC');
    await user.click(button('Usar cor'));

    expect(onPick.mock.calls).toEqual([['#aabbcc']]);
  });

  it('opens on the current custom color', async () => {
    renderTile({ value: '#336699' });
    await openPanel('Cor personalizada: #336699');

    expect(screen.getByLabelText('Código da cor')).toHaveValue('#336699');
  });

  it('clicking a saved color picks it and closes', async () => {
    api.colors = ['#112233'];
    renderTile();
    await openPanel();

    await user.click(await screen.findByRole('button', { name: '#112233' }));

    expect(onPick.mock.calls).toEqual([['#112233']]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('"Salvar" adds to the list without picking and keeps the panel open', async () => {
    renderTile();
    await openPanel();

    await typeCode('#336699');
    await user.click(button('Salvar'));

    expect(await screen.findByRole('button', { name: '#336699' })).toBeInTheDocument();
    expect(api.colors).toEqual(['#336699']);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('the keyboard on the canvas changes the preview and does not pick', async () => {
    renderTile({ value: '#336699' });
    await openPanel('Cor personalizada: #336699');

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Matiz' }), {
      key: 'ArrowRight',
      keyCode: 39,
    });

    await waitFor(() => expect(screen.getByLabelText('Código da cor')).toHaveValue('#334799'));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('Esc discards the preview: the panel reopens on the current color', async () => {
    renderTile({ value: '#336699' });
    await openPanel('Cor personalizada: #336699');
    await typeCode('#aabbcc');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await openPanel('Cor personalizada: #336699');

    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Código da cor')).toHaveValue('#336699');
  });

  it('a color already saved turns "Salvar" off', async () => {
    api.colors = ['#336699'];
    renderTile({ value: '#336699' });
    await openPanel('Cor personalizada: #336699');

    await screen.findByRole('button', { name: '#336699' });

    expect(button('Salvar')).toBeDisabled();
    expect(button('Usar cor')).toBeEnabled();
  });

  it('with the list full a new color cannot be saved and the message asks to delete one', async () => {
    api.colors = fullSavedColors();
    renderTile({ value: '#336699' });
    await openPanel('Cor personalizada: #336699');

    expect(await screen.findByText(/exclua uma/i)).toBeInTheDocument();
    expect(button('Salvar')).toBeDisabled();
    expect(button('Usar cor')).toBeEnabled();
  });

  it('a limit the server reports with a stale list shows the same message', async () => {
    api.answers.answer('save', { ok: false, failure: { kind: 'saved_colors_limit' } });
    renderTile({ value: '#336699' });
    await openPanel('Cor personalizada: #336699');

    await user.click(button('Salvar'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/exclua uma/i);
  });

  it('deleting a saved color does not pick and keeps the panel open', async () => {
    api.colors = ['#112233', '#445566'];
    renderTile();
    await openPanel();

    await user.click(await screen.findByRole('button', { name: 'Excluir #112233' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '#112233' })).not.toBeInTheDocument(),
    );
    expect(api.colors).toEqual(['#445566']);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('deleting by keyboard keeps the focus inside the panel', async () => {
    api.colors = ['#112233'];
    renderTile();
    await openPanel();

    (await screen.findByRole('button', { name: 'Excluir #112233' })).focus();
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '#112233' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });

  it('an empty list says so', async () => {
    renderTile();
    await openPanel();

    expect(within(screen.getByRole('dialog')).getByText('Nenhuma cor salva ainda.')).toBeVisible();
  });

  it('reads the list each time it opens', async () => {
    renderTile();
    await openPanel();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await openPanel();

    expect(api.answers.callsOf('list')).toHaveLength(2);
  });

  it('shows the last known list while the new one is on the way', async () => {
    api.colors = ['#112233'];
    renderTile();
    await openPanel();
    await screen.findByRole('button', { name: '#112233' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    api.answers.hold('list');

    await openPanel();

    expect(screen.getByRole('button', { name: '#112233' })).toBeInTheDocument();
  });

  it('on a dark background a dark color warns', async () => {
    renderTile({ value: '#101010', legibleOn: '#15181d' });
    await openPanel('Cor personalizada: #101010');

    expect(screen.getByText(LOW_CONTRAST)).toBeInTheDocument();
    expect(button('Usar cor')).toBeEnabled();
  });

  it('on a dark background a light color does not warn', async () => {
    renderTile({ value: '#d9b45a', legibleOn: '#15181d' });
    await openPanel('Cor personalizada: #d9b45a');

    expect(screen.queryByText(LOW_CONTRAST)).not.toBeInTheDocument();
  });

  it('without legibleOn a dark color does not warn', async () => {
    renderTile({ value: '#101010' });
    await openPanel('Cor personalizada: #101010');

    expect(screen.queryByText(LOW_CONTRAST)).not.toBeInTheDocument();
  });

  it.each(['', '#12', 'zzzzzz'])(
    'the invalid code "%s" is marked and turns the buttons off',
    async (typed) => {
      renderTile({ value: '#336699' });
      await openPanel('Cor personalizada: #336699');

      await typeCode(typed);

      expect(screen.getByLabelText('Código da cor')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText('Código da cor')).toHaveAccessibleDescription(/#rrggbb/);
      expect(button('Usar cor')).toBeDisabled();
      expect(button('Salvar')).toBeDisabled();
    },
  );

  it('a valid code is not marked', async () => {
    renderTile({ value: '#336699' });
    await openPanel('Cor personalizada: #336699');

    expect(screen.getByLabelText('Código da cor')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('the API failing raises an alert and the panel stays usable', async () => {
    api.answers.answer('list', OFFLINE);
    renderTile();
    await openPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent(/conexão/i);

    await typeCode('#336699');
    await user.click(button('Usar cor'));

    expect(onPick.mock.calls).toEqual([['#336699']]);
  });

  describe('the plan', () => {
    const HINT = 'Disponível no Narrador';

    function renderLocked(locks: CustomColorLocks, scope?: CustomColorScope): void {
      render(
        <CustomColorLocksContext value={locks}>
          <SavedColorsProvider api={api} userId="bia">
            <CustomColorTile value={null} onPick={onPick} scope={scope} />
          </SavedColorsProvider>
        </CustomColorLocksContext>,
      );
    }

    it('the table content of a free table: the tile is off and says where it is', () => {
      renderLocked({ account: null, table: HINT }, 'table');
      expect(button('Cor personalizada')).toBeDisabled();
      expect(button('Cor personalizada')).toHaveAccessibleDescription(HINT);
    });

    it('the profile of an account that may not customize: off by the account', () => {
      renderLocked({ account: HINT, table: null }, 'account');
      expect(button('Cor personalizada')).toBeDisabled();
    });

    it('each scope reads only its own lock', () => {
      renderLocked({ account: null, table: HINT }, 'account');
      expect(button('Cor personalizada')).toBeEnabled();
    });

    it('a field with no scope (a cover tone) is always offered', () => {
      renderLocked({ account: HINT, table: HINT });
      expect(button('Cor personalizada')).toBeEnabled();
    });

    it('on a paid table, an account that may not customize still uses the color but cannot save it', async () => {
      renderLocked({ account: HINT, table: null }, 'table');
      await openPanel();
      expect(button('Salvar')).toBeDisabled();
      expect(button('Usar cor')).toBeEnabled();
    });
  });
});
