import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SaveTokenDialog } from '@/features/saved-tokens/save-token-dialog';
import { createSavedTokensStore } from '@/stores/saved-tokens-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { SavedTokensApiFake } from '../../support/saved-tokens-api-fake';
import { lyra } from '../../support/table-session-fixtures';

function setup(api = new SavedTokensApiFake([])) {
  const list = createSavedTokensStore(api, VHARN.id);
  const closes: number[] = [];
  render(<SaveTokenDialog token={lyra()} list={list} onClose={() => closes.push(1)} />);
  return { api, list, closes, user: userEvent.setup() };
}

describe('SaveTokenDialog', () => {
  it('opens with the token’s name and saves Lyra as she is now, then closes', async () => {
    const { api, closes, user } = setup();

    expect(screen.getByRole('textbox', { name: 'Nome do token salvo' })).toHaveValue('Lyra');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(closes).toEqual([1]));
    expect(api.savedTokens[0]).toMatchObject({ name: 'Lyra', folderId: null });
    expect(api.savedTokens[0]?.token.bars.map((bar) => bar.current)).toEqual([32, 1]);
  });

  it('a refusal of the plan stays in the dialog with its sentence, and it does not close', async () => {
    const api = new SavedTokensApiFake([]);
    const { closes, user } = setup(api);
    await waitFor(() => expect(api.calls).toContain('listFolders'));
    api.failNext({
      kind: 'plan_limit',
      planLimit: { resource: 'savedTokens', limit: 0, plan: 'free', reason: 'room' },
    });

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Salvar token está nos planos pagos.',
    );
    expect(closes).toEqual([]);
  });

  it('an empty name cannot be saved', async () => {
    const { user } = setup();

    await user.clear(screen.getByRole('textbox', { name: 'Nome do token salvo' }));

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('"Cancelar" closes without saving', async () => {
    const onClose = vi.fn();
    const api = new SavedTokensApiFake([]);
    render(
      <SaveTokenDialog
        token={lyra()}
        list={createSavedTokensStore(api, VHARN.id)}
        onClose={onClose}
      />,
    );

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(api.calls).not.toContain('create:Lyra');
  });
});
