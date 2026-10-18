import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConfigureGridDialog } from '@/features/board/configure-grid-dialog';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { VHARN_SCENE } from '../../support/table-session-fixtures';

describe('ConfigureGridDialog', () => {
  let commands: TableBoardCommandsFake;
  let closed: number;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    closed = 0;
  });

  function renderDialog(connected = true): void {
    render(
      <ConfigureGridDialog
        campaignId={VHARN.id}
        scene={VHARN_SCENE}
        commands={commands}
        connected={connected}
        onClose={() => {
          closed += 1;
        }}
      />,
    );
  }

  async function replace(label: string, value: string): Promise<void> {
    const field = screen.getByLabelText(label);
    await userEvent.clear(field);
    if (value) await userEvent.type(field, value);
  }

  it('opens with the values of the scene', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Configurar grid' })).toBeInTheDocument();
    expect(screen.getByLabelText('Largura (casas)')).toHaveValue('20');
    expect(screen.getByLabelText('Altura (casas)')).toHaveValue('12');
    expect(screen.getByLabelText('Distância de uma casa')).toHaveValue('1,5');
    expect(screen.getByLabelText('Unidade')).toHaveValue('m');
    expect(screen.getByLabelText('Opacidade do grid (%)')).toHaveValue('30');
    expect(screen.getByRole('checkbox', { name: 'Grid visível' })).toBeChecked();
  });

  it('saving sends scene:configure with numbers ("1,5" becomes 1.5) and closes on ok', async () => {
    renderDialog();
    await replace('Largura (casas)', '30');
    await replace('Altura (casas)', '20');
    await replace('Distância de uma casa', '2,5');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(commands.sent).toEqual([
      {
        name: 'configureScene',
        campaignId: VHARN.id,
        fields: {
          widthCells: 30,
          heightCells: 20,
          cellDistance: 2.5,
          cellUnit: 'm',
          gridVisible: true,
          gridOpacity: 30,
        },
      },
    ]);
    expect(closed).toBe(1);
  });

  it('has no spin buttons: the numbers are text fields that keep only what makes a number', async () => {
    renderDialog();
    expect(screen.queryAllByRole('spinbutton')).toEqual([]);
    await replace('Largura (casas)', '2a5-');
    expect(screen.getByLabelText('Largura (casas)')).toHaveValue('25');
    await replace('Distância de uma casa', '1,,5m');
    expect(screen.getByLabelText('Distância de uma casa')).toHaveValue('1,5');
  });

  it('"Unidade" is a choice of cm, m and km, and km is sent as chosen', async () => {
    renderDialog();
    const unit = screen.getByRole('combobox', { name: 'Unidade' });
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['cm', 'm', 'km']);
    await userEvent.selectOptions(unit, 'km');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(commands.sentAs('configureScene')[0]?.fields).toMatchObject({ cellUnit: 'km' });
  });

  it('while the command is on its way it reads "Salvando…", busy and disabled', async () => {
    commands.hold();
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const saving = screen.getByRole('button', { name: 'Salvando…' });
    expect(saving).toBeDisabled();
    expect(saving).toHaveAttribute('aria-busy', 'true');
  });

  it('a width of 0 says "Use de 1 a 100 casas." on the field and sends nothing', async () => {
    renderDialog();
    await replace('Largura (casas)', '0');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const width = screen.getByLabelText('Largura (casas)');
    expect(width).toHaveAttribute('aria-invalid', 'true');
    expect(width).toHaveAccessibleDescription('Use de 1 a 100 casas.');
    expect(commands.sent).toEqual([]);
  });

  it('a blank distance says how to write it', async () => {
    renderDialog();
    await replace('Distância de uma casa', '');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByLabelText('Distância de uma casa')).toHaveAccessibleDescription(
      'Use uma distância maior que zero, como 1,5.',
    );
  });

  it('FORBIDDEN reads "Só o mestre pode fazer isso." in an alert and keeps the dialog', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Só o mestre pode fazer isso.');
    expect(closed).toBe(0);
  });

  it('an ack that never arrives reads the offline message', async () => {
    commands.answerWith({ ok: false, failure: 'offline' });
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão com o servidor.');
  });

  it('while reconnecting, "Salvar" is disabled and says why', () => {
    renderDialog(false);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(screen.getByText('Sem conexão. Aguarde reconectar.')).toBeInTheDocument();
  });

  it('"Cancelar" closes without sending', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(closed).toBe(1);
    expect(commands.sent).toEqual([]);
  });
});
