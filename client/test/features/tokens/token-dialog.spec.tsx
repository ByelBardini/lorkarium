import { cell } from '@lorkarium/game-core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { TokenDialog } from '@/features/tokens/token-dialog';
import type { TokenDto } from '@lorkarium/contracts';
import { VHARN } from '../../support/campaigns-api-fake';
import { AssetsApiFake, LYRA_PORTRAIT } from '../../support/assets-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { BIA_AT_TABLE, CAIO_AT_TABLE, LYRA_ID, lyra } from '../../support/table-session-fixtures';

const PLAYERS = [BIA_AT_TABLE, CAIO_AT_TABLE].map(({ userId, name }) => ({ userId, name }));

describe('TokenDialog', () => {
  let commands: TableBoardCommandsFake;
  let closed: number;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    closed = 0;
  });

  function renderDialog(token: TokenDto | null = null): void {
    render(
      <TokenDialog
        campaignId={VHARN.id}
        token={token}
        placeAt={cell(9, 5)}
        layer="tokens"
        players={PLAYERS}
        commands={commands}
        assets={new AssetsApiFake()}
        connected
        onClose={() => {
          closed += 1;
        }}
      />,
    );
  }

  it('"Novo token" fills the initials from the name and creates it at the center of the view', async () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Novo token' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Ogro das Cinzas');
    expect(within(dialog).getByLabelText('Iniciais')).toHaveValue('OC');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Inimigo' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: '2 × 2' }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Bia' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar token' }));
    expect(commands.sentAs('createToken')).toEqual([
      {
        name: 'createToken',
        campaignId: VHARN.id,
        fields: {
          name: 'Ogro das Cinzas',
          initials: 'OC',
          side: 'enemy',
          size: 2,
          controllerIds: [BIA_AT_TABLE.userId],
          imageAssetId: null,
          bars: [],
          col: 9,
          row: 5,
          layer: 'tokens',
        },
      },
    ]);
    expect(closed).toBe(1);
  });

  it('initials typed by hand are kept when the name changes', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Kael');
    await userEvent.clear(screen.getByLabelText('Iniciais'));
    await userEvent.type(screen.getByLabelText('Iniciais'), 'kx');
    await userEvent.type(screen.getByLabelText('Nome'), ' Rubro');
    expect(screen.getByLabelText('Iniciais')).toHaveValue('KX');
  });

  it('an empty name reads "Informe o nome do token." on the field and sends nothing', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));
    expect(screen.getByLabelText('Nome')).toHaveAccessibleDescription('Informe o nome do token.');
    expect(commands.sent).toEqual([]);
  });

  it('while saving it reads "Salvando…", busy and disabled', async () => {
    commands.hold();
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Kael');
    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));
    const saving = screen.getByRole('button', { name: 'Salvando…' });
    expect(saving).toBeDisabled();
    expect(saving).toHaveAttribute('aria-busy', 'true');
  });

  it('a refusal goes to an alert and keeps the dialog open', async () => {
    commands.answerWith({ ok: false, failure: 'invalid' });
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Kael');
    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Confira os campos e tente de novo.',
    );
    expect(closed).toBe(0);
  });

  it('"Editar token" opens filled and sends token:update', async () => {
    renderDialog(lyra());
    const dialog = screen.getByRole('dialog', { name: 'Editar token' });
    expect(within(dialog).getByLabelText('Nome')).toHaveValue('Lyra');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(commands.sentAs('updateToken')).toEqual([
      expect.objectContaining({
        fields: expect.objectContaining({ tokenId: LYRA_ID, name: 'Lyra' }),
      }),
    ]);
  });

  it('"Excluir token" asks first and then sends token:delete', async () => {
    renderDialog(lyra());
    await userEvent.click(screen.getByRole('button', { name: 'Excluir token' }));
    expect(screen.getByText('Excluir Lyra? Isso não tem volta.')).toBeInTheDocument();
    expect(commands.sent).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(commands.sentAs('deleteToken')).toEqual([
      { name: 'deleteToken', campaignId: VHARN.id, fields: { tokenId: LYRA_ID } },
    ]);
  });

  it('the master creates a token with an image chosen in "Imagem"', async () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Novo token' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Lyra');
    const file = new File([new Uint8Array(4)], 'lyra.png', { type: 'image/png' });

    await userEvent.upload(within(dialog).getByLabelText('Arquivo de imagem'), file);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar token' }));

    expect(commands.sentAs('createToken')[0]?.fields).toMatchObject({
      imageAssetId: LYRA_PORTRAIT.id,
    });
  });

  it('editing a token without touching its image sends the image it has', async () => {
    renderDialog(lyra({ imageAssetId: LYRA_PORTRAIT.id }));

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(commands.sentAs('updateToken')[0]?.fields).toMatchObject({
      tokenId: LYRA_ID,
      imageAssetId: LYRA_PORTRAIT.id,
    });
  });
});
