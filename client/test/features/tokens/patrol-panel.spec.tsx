import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cell } from '@lorkarium/game-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { PatrolPanel } from '@/features/tokens/patrol-panel';
import { createTokenPatrolEditor, type TokenPatrolEditor } from '@/stores/token-patrol-flow';
import { squarePatrol } from '../../support/patrol-fixtures';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { KAEL_ID, VHARN_GRID, kael } from '../../support/table-session-fixtures';

describe('PatrolPanel', () => {
  let commands: TableBoardCommandsFake;
  let editor: StoreApi<TokenPatrolEditor>;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    editor = createTokenPatrolEditor({ commands, fullNotice: 'Até 32 pontos.' });
  });

  function openOnKael(token = kael({ col: 4, row: 4 }), connected = true): void {
    act(() => editor.getState().open({ scope: VHARN_GRID, token, say: () => undefined }));
    render(<PatrolPanel editor={editor} connected={connected} />);
  }

  function addKaelRoute(): void {
    act(() => {
      editor.getState().addPoint(cell(8, 4));
      editor.getState().addPoint(cell(8, 8));
    });
  }

  const button = (name: string) => screen.getByRole('button', { name });

  it('shows nothing with the editor closed', () => {
    render(<PatrolPanel editor={editor} connected />);

    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('opens as "Patrulha de Kael" with "Andando" pressed', () => {
    openOnKael();

    expect(screen.getByRole('region', { name: 'Patrulha de Kael' })).toBeInTheDocument();
    expect(button('Andando 1')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Rápido 2')).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks the chosen speed on sight, and says how fast each shortcut is', async () => {
    openOnKael();
    expect(screen.getByRole('group', { name: /casas por segundo/ })).toBeInTheDocument();
    expect(button('Andando 1')).toHaveClass('border-primary');
    expect(button('Devagar 0,5')).not.toHaveClass('border-primary');

    await userEvent.click(button('Devagar 0,5'));

    expect(button('Devagar 0,5')).toHaveClass('border-primary');
    expect(button('Andando 1')).not.toHaveClass('border-primary');
  });

  it('a speed between the shortcuts marks none of them and shows in the stepper', async () => {
    openOnKael();

    await userEvent.click(button('Mais rápido'));

    expect(editor.getState().draft?.speed).toBe(1.25);
    expect(screen.getByText('1,25 casas/s')).toBeInTheDocument();
    for (const name of ['Devagar 0,5', 'Andando 1', 'Rápido 2']) {
      expect(button(name)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('"Rápido" sets 2 cells per second', async () => {
    openOnKael();

    await userEvent.click(button('Rápido 2'));

    expect(editor.getState().draft?.speed).toBe(2);
  });

  it('"Personalizado" steps by 0,25, and its − stops at 0,25', async () => {
    openOnKael(kael({ col: 4, row: 4, patrol: squarePatrol({ speed: 0.5 }) }));

    await userEvent.click(button('Mais devagar'));

    expect(editor.getState().draft?.speed).toBe(0.25);
    expect(button('Mais devagar')).toBeDisabled();
    expect(screen.getByText('0,25 casas/s')).toBeInTheDocument();
  });

  it('the + of "Personalizado" stops at 4', async () => {
    openOnKael(kael({ col: 4, row: 4, patrol: squarePatrol({ speed: 3.75 }) }));

    await userEvent.click(button('Mais rápido'));

    expect(editor.getState().draft?.speed).toBe(4);
    expect(button('Mais rápido')).toBeDisabled();
  });

  it('"Ida e volta" and "Virar para onde anda" change the draft', async () => {
    openOnKael();

    await userEvent.click(screen.getByRole('radio', { name: 'Ida e volta' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Virar para onde anda' }));

    expect(editor.getState().draft).toMatchObject({ repeat: 'bounce', turns: false });
  });

  it('sums up the route: "3 pontos · 12 casas por volta · 12 s"', () => {
    openOnKael();
    addKaelRoute();

    expect(screen.getByText('3 pontos · 12 casas por volta · 12 s')).toBeInTheDocument();
  });

  it('"Salvar" is off with the single point of the token', () => {
    openOnKael();

    expect(button('Salvar')).toBeDisabled();
  });

  it('"Salvar" sends the route and the panel closes on the ok', async () => {
    openOnKael();
    addKaelRoute();

    await userEvent.click(button('Salvar'));

    expect(commands.sent[0]).toMatchObject({
      name: 'setTokenPatrol',
      fields: { tokenId: KAEL_ID },
    });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('a route that leaves the scene is refused in an alert and the editor stays', async () => {
    openOnKael();
    addKaelRoute();
    commands.answerWith({ ok: false, failure: 'out_of_scene' });

    await userEvent.click(button('Salvar'));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Um ponto da rota sai da cena para este tamanho de token.',
    );
    expect(screen.getByRole('region', { name: 'Patrulha de Kael' })).toBeInTheDocument();
  });

  it('an ack outside the DTO says something went wrong', async () => {
    openOnKael();
    addKaelRoute();
    commands.answerWith({ ok: false, failure: 'unexpected' });

    await userEvent.click(button('Salvar'));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Algo deu errado do nosso lado. Tente de novo em instantes.',
    );
  });

  it('without a connection "Salvar" is off and the panel says so', () => {
    openOnKael(kael({ col: 4, row: 4 }), false);
    addKaelRoute();

    expect(button('Salvar')).toBeDisabled();
    expect(screen.getByText('Sem conexão. Aguarde reconectar.')).toBeInTheDocument();
  });

  it('a saved patrol opens ready to save, with its route in the summary', () => {
    openOnKael(kael({ col: 4, row: 4, patrol: squarePatrol() }));

    expect(button('Salvar')).toBeEnabled();
    expect(screen.getByText(/^4 pontos/)).toBeInTheDocument();
  });

  it('"Redesenhar" starts over from the token, and is gone with nothing to throw away', async () => {
    openOnKael(kael({ col: 4, row: 4, patrol: squarePatrol() }));

    await userEvent.click(button('Redesenhar'));

    expect(screen.getByText('1 ponto')).toBeInTheDocument();
    expect(button('Salvar')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Redesenhar' })).not.toBeInTheDocument();
  });

  it('"Remover patrulha" shows only with a saved patrol, and sends patrol null', async () => {
    openOnKael(kael({ col: 4, row: 4, patrol: squarePatrol() }));

    await userEvent.click(button('Remover patrulha'));

    expect(commands.sent[0]).toMatchObject({ fields: { tokenId: KAEL_ID, patrol: null } });
  });

  it('a token with no patrol has no "Remover patrulha"', () => {
    openOnKael();

    expect(screen.queryByRole('button', { name: 'Remover patrulha' })).not.toBeInTheDocument();
  });

  it('Backspace takes the last point off and Esc closes, wherever the focus is', async () => {
    openOnKael();
    addKaelRoute();

    await userEvent.keyboard('{Backspace}');
    expect(editor.getState().draft?.path).toHaveLength(2);

    await userEvent.keyboard('{Escape}');
    expect(editor.getState().draft).toBeNull();
  });

  it('Enter saves the route', async () => {
    openOnKael();
    addKaelRoute();

    await userEvent.keyboard('{Enter}');

    expect(commands.sent).toHaveLength(1);
  });
});
