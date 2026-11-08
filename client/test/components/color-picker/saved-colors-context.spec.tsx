import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SavedColorsProvider } from '@/components/color-picker/saved-colors-context';
import { useSavedColorsStore } from '@/components/color-picker/use-saved-colors-store';
import { useSavedColors } from '@/stores/saved-colors-store';
import { SavedColorsApiFake } from '../../support/saved-colors-api-fake';

function SavedColorsProbe(): React.JSX.Element {
  const store = useSavedColorsStore();
  const colors = useSavedColors(store, (state) => state.colors);
  return (
    <>
      <output aria-label="Lista">{colors.join(',')}</output>
      <button type="button" onClick={() => void store.getState().load()}>
        Carregar
      </button>
      <button type="button" onClick={() => void store.getState().save('#112233')}>
        Salvar
      </button>
    </>
  );
}

function accountTree(api: SavedColorsApiFake, userId: string): React.JSX.Element {
  return (
    <SavedColorsProvider api={api} userId={userId}>
      <SavedColorsProbe />
    </SavedColorsProvider>
  );
}

async function loadList(): Promise<void> {
  await userEvent.setup().click(screen.getByRole('button', { name: 'Carregar' }));
}

describe('SavedColorsProvider', () => {
  it('hands its children the list of the account', async () => {
    const api = new SavedColorsApiFake();
    api.colors = ['#336699'];
    render(accountTree(api, 'bia'));

    await loadList();

    await waitFor(() => expect(screen.getByLabelText('Lista')).toHaveTextContent('#336699'));
  });

  it('another account starts with an empty list until its own arrives', async () => {
    const api = new SavedColorsApiFake();
    api.colors = ['#336699'];
    const { rerender } = render(accountTree(api, 'bia'));
    await loadList();
    await waitFor(() => expect(screen.getByLabelText('Lista')).toHaveTextContent('#336699'));

    api.colors = ['#aabbcc'];
    rerender(accountTree(api, 'caio'));

    expect(screen.getByLabelText('Lista')).toBeEmptyDOMElement();
    await loadList();
    await waitFor(() => expect(screen.getByLabelText('Lista')).toHaveTextContent('#aabbcc'));
  });

  it('a new render of the same account keeps the list', async () => {
    const api = new SavedColorsApiFake();
    api.colors = ['#336699'];
    const { rerender } = render(accountTree(api, 'bia'));
    await loadList();
    await waitFor(() => expect(screen.getByLabelText('Lista')).toHaveTextContent('#336699'));

    rerender(accountTree(api, 'bia'));

    expect(screen.getByLabelText('Lista')).toHaveTextContent('#336699');
  });
});

describe('useSavedColorsStore outside a provider', () => {
  it('stays an empty list that accepts commands and changes nothing', async () => {
    render(<SavedColorsProbe />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Salvar' }));
    await loadList();

    expect(screen.getByLabelText('Lista')).toBeEmptyDOMElement();
  });
});
