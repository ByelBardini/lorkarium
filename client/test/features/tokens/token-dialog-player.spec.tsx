import type { TokenDto, TokenLayerDto } from '@lorkarium/contracts';
import { cell } from '@lorkarium/game-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { TokenDialog, type TokenDialogViewer } from '@/features/tokens/token-dialog';
import { AssetsApiFake } from '../../support/assets-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  LYRA_ID,
  lyra,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

const PLAYERS = [BIA_AT_TABLE, CAIO_AT_TABLE].map(({ userId, name }) => ({ userId, name }));
const BIA_WITH_DELETE: TokenDialogViewer = {
  mode: 'player',
  userId: BIA_AT_TABLE.userId,
  canDelete: true,
};
const BIA_NO_DELETE: TokenDialogViewer = { ...BIA_WITH_DELETE, canDelete: false };
const BIAS_LYRA = lyra({ createdBy: BIA_AT_TABLE.userId, controllerIds: [BIA_AT_TABLE.userId] });

let commands: TableBoardCommandsFake;

beforeEach(() => {
  commands = new TableBoardCommandsFake();
});

type Opened = Readonly<{ viewer?: TokenDialogViewer; layer?: TokenLayerDto }>;

function renderDialog(token: TokenDto | null, { viewer, layer = 'tokens' }: Opened): void {
  render(
    <TokenDialog
      scope={VHARN_GRID}
      token={token}
      placeAt={cell(9, 5)}
      layer={layer}
      players={PLAYERS}
      commands={commands}
      assets={new AssetsApiFake()}
      distance={{ cellDistance: 1.5, cellUnit: 'm' }}
      connected
      viewer={viewer}
      onClose={() => undefined}
    />,
  );
}

const bia = () => screen.getByRole('button', { name: 'Bia' });

describe('TokenDialog, a player', () => {
  it('has no "Visão e luz" tab, and says vision and light stay with the master', () => {
    renderDialog(null, { viewer: BIA_NO_DELETE });

    expect(screen.queryByRole('tab', { name: 'Visão e luz' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Aura' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Novo token' })).toHaveAccessibleDescription(
      'Todo mundo na mesa vê o token assim que você criar. Visão e luz ficam com o mestre.',
    );
  });

  it('"Criar token" sends no sight, light nor field of view, on Tokens with Objetos active', async () => {
    renderDialog(null, { viewer: BIA_NO_DELETE, layer: 'objects' });
    await userEvent.type(screen.getByLabelText('Nome'), 'Lobo');

    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));

    const [created] = commands.sentAs('createToken');
    expect(created?.fields).toMatchObject({ name: 'Lobo', layer: 'tokens', col: 9, row: 5 });
    expect(created?.fields).not.toHaveProperty('sight');
    expect(created?.fields).not.toHaveProperty('light');
    expect(created?.fields).not.toHaveProperty('sightAngle');
  });

  it('a new token starts with her pressed and locked in "Quem controla", and goes with her', async () => {
    renderDialog(null, { viewer: BIA_NO_DELETE });
    await userEvent.type(screen.getByLabelText('Nome'), 'Lobo');

    expect(bia()).toHaveAttribute('aria-pressed', 'true');
    expect(bia()).toBeDisabled();
    expect(bia()).toHaveAccessibleDescription('Você criou, então sempre controla.');
    await userEvent.click(screen.getByRole('button', { name: 'Caio' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));

    expect(commands.sentAs('createToken')[0]?.fields).toMatchObject({
      controllerIds: [BIA_AT_TABLE.userId, CAIO_AT_TABLE.userId],
    });
  });

  it('editing her token the master took her out of puts her back in "Quem controla"', async () => {
    renderDialog(lyra({ createdBy: BIA_AT_TABLE.userId, controllerIds: [] }), {
      viewer: BIA_NO_DELETE,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(commands.sentAs('updateToken')[0]?.fields).toMatchObject({
      tokenId: LYRA_ID,
      controllerIds: [BIA_AT_TABLE.userId],
    });
  });

  it('editing her token without the delete key offers no "Excluir token"', () => {
    renderDialog(BIAS_LYRA, { viewer: BIA_NO_DELETE });

    expect(screen.queryByRole('button', { name: 'Excluir token' })).toBeNull();
  });

  it('editing her token with the delete key offers "Excluir token", which sends token:delete', async () => {
    renderDialog(BIAS_LYRA, { viewer: BIA_WITH_DELETE });

    await userEvent.click(screen.getByRole('button', { name: 'Excluir token' }));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(commands.sentAs('deleteToken').map(({ fields }) => fields)).toEqual([
      { tokenId: LYRA_ID },
    ]);
  });
});

describe('TokenDialog, the master on a player’s token', () => {
  it('takes Bia out of "Quem controla" like anyone', async () => {
    renderDialog(BIAS_LYRA, {});

    expect(bia()).toBeEnabled();
    await userEvent.click(bia());
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(commands.sentAs('updateToken')[0]?.fields).toMatchObject({ controllerIds: [] });
  });

  it('keeps "Visão e luz" and "Excluir token"', () => {
    renderDialog(BIAS_LYRA, {});

    expect(screen.getByRole('tab', { name: 'Visão e luz' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir token' })).toBeInTheDocument();
  });
});
