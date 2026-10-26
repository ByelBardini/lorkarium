import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TokenDto } from '@lorkarium/contracts';
import { TokenAuraDialog } from '@/features/tokens/token-aura-dialog';
import { AssetsApiFake } from '../../support/assets-api-fake';
import { fireAura, goldAura, runeAura } from '../../support/aura-fixtures';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { LYRA_ID, lyra, VHARN_GRID } from '../../support/table-session-fixtures';

const METERS = { cellDistance: 1.5, cellUnit: 'm' };

describe('TokenAuraDialog', () => {
  let commands: TableBoardCommandsFake;
  let closed: number;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    closed = 0;
  });

  function renderDialog(token: TokenDto = lyra()): void {
    render(
      <TokenAuraDialog
        scope={VHARN_GRID}
        token={token}
        commands={commands}
        assets={new AssetsApiFake()}
        distance={METERS}
        onClose={() => {
          closed += 1;
        }}
      />,
    );
  }

  function sentStyles(): unknown[] {
    return commands.sentAs('restyleTokens').map(({ fields }) => fields);
  }

  it('"Aura de Lyra": Cor Ouro of 3 m and "Salvar" restyle Lyra alone with it and close', async () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Aura de Lyra' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Cor' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(sentStyles()).toEqual([{ tokenIds: [LYRA_ID], style: { aura: goldAura() } }]);
    expect(closed).toBe(1);
  });

  it('"Nenhuma" and "Salvar" take the aura of Lyra away', async () => {
    renderDialog(lyra({ aura: fireAura() }));

    await userEvent.click(screen.getByRole('radio', { name: 'Nenhuma' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(sentStyles()).toEqual([{ tokenIds: [LYRA_ID], style: { aura: null } }]);
  });

  it('"Tirar aura" takes the aura of Lyra away at once and closes, whatever the form holds', async () => {
    renderDialog(lyra({ aura: fireAura() }));
    await userEvent.click(screen.getByRole('radio', { name: 'Cor' }));

    await userEvent.click(screen.getByRole('button', { name: 'Tirar aura' }));

    expect(sentStyles()).toEqual([{ tokenIds: [LYRA_ID], style: { aura: null } }]);
    expect(closed).toBe(1);
  });

  it('a token without an aura has no "Tirar aura"', () => {
    renderDialog(lyra({ aura: null }));

    expect(screen.queryByRole('button', { name: 'Tirar aura' })).toBeNull();
  });

  it('a round image aura saved as Redonda keeps its shape', async () => {
    renderDialog(lyra({ aura: runeAura() }));

    await userEvent.click(screen.getByRole('radio', { name: 'Redonda' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(sentStyles()).toEqual([
      { tokenIds: [LYRA_ID], style: { aura: runeAura({ shape: 'round' }) } },
    ]);
  });

  it('a radius of 31 m is told under the field and nothing is sent', async () => {
    renderDialog(lyra({ aura: fireAura() }));
    const radius = screen.getByLabelText('Raio além da borda (m)');
    await userEvent.clear(radius);
    await userEvent.type(radius, '31');

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByText('De 0 a 30 m.')).toBeInTheDocument();
    expect(sentStyles()).toEqual([]);
    expect(closed).toBe(0);
  });

  it('a refusal shows in an alert with the reason and keeps the dialog open', async () => {
    commands.answerWith({ ok: false, failure: 'asset_not_found' });
    renderDialog(lyra({ aura: fireAura() }));

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Essa imagem não está mais na mesa.',
    );
    expect(closed).toBe(0);
  });
});
