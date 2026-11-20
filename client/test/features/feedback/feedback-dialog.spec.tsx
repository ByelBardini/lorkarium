import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackDialog } from '@/features/feedback/feedback-dialog';
import { FeedbackApiFake } from '../../support/feedback-api-fake';

const BROWSER = { platform: 'browser', appVersion: 'Chrome 142' } as const;
const DESKTOP = { platform: 'desktop', appVersion: 'Lorkarium 0.3.1' } as const;

let api: FeedbackApiFake;

beforeEach(() => {
  api = new FeedbackApiFake();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

function renderDialog(where: typeof BROWSER | typeof DESKTOP = BROWSER) {
  const onOpenChange = vi.fn();
  render(<FeedbackDialog api={api} where={where} open onOpenChange={onOpenChange} />);
  return onOpenChange;
}

async function fillBug(): Promise<void> {
  await userEvent.type(screen.getByLabelText('Passos para reproduzir'), 'Abri a mesa');
  await userEvent.type(screen.getByLabelText('O que você esperava'), 'O token andar');
  await userEvent.type(screen.getByLabelText('O que aconteceu'), 'O token voltou');
}

describe('FeedbackDialog', () => {
  it('warns that the text may go public on GitHub and the screenshots stay with the team', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Relatar um bug ou sugerir' })).toHaveTextContent(
      /pode publicar uma versão dele no GitHub, que é público\. Os prints ficam só com a equipe\./,
    );
  });

  it('a bug asks for its three sections, and a suggestion for its own, keeping what was typed', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Passos para reproduzir'), 'Abri a mesa');

    await userEvent.click(screen.getByRole('radio', { name: 'Sugerir uma melhoria' }));

    expect(screen.queryByLabelText('Passos para reproduzir')).toBeNull();
    expect(screen.getByLabelText('Qual problema isso resolve')).toBeInTheDocument();
    expect(screen.getByLabelText('Alternativas que você já tentou (opcional)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Relatar um bug' }));
    expect(screen.getByLabelText('Passos para reproduzir')).toHaveValue('Abri a mesa');
  });

  it('shows where the app detected, the Windows app and its version, with nothing to edit', () => {
    renderDialog(DESKTOP);

    expect(screen.getByText('App para Windows · Lorkarium 0.3.1')).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Navegador' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /versão/ })).toBeNull();
  });

  it('sending with a blank section marks and focuses the first one, and sends nothing', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Passos para reproduzir'), 'Abri a mesa');

    await userEvent.click(screen.getByRole('button', { name: 'Enviar relato' }));

    const expected = screen.getByLabelText('O que você esperava');
    expect(expected).toHaveFocus();
    expect(expected).toHaveAttribute('aria-invalid', 'true');
    expect(expected).toHaveAccessibleDescription('Preencha este campo.');
    expect(api.sent).toEqual([]);
  });

  it('a complete bug goes with its screenshot, and the person is told how they hear back', async () => {
    renderDialog();
    await fillBug();
    const shot = new File(['png'], 'tela.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Anexar prints'), shot);

    await userEvent.click(screen.getByRole('button', { name: 'Enviar relato' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Recebemos seu relato. Se ele virar uma issue no GitHub, você recebe o link por e-mail.',
    );
    expect(api.sent).toEqual([
      {
        content: {
          kind: 'bug',
          steps: 'Abri a mesa',
          expected: 'O token andar',
          actual: 'O token voltou',
        },
        ...BROWSER,
        attachmentIds: [api.uploads[0]],
      },
    ]);
  });

  it('a screenshot that does not go up keeps the feedback from leaving, with its reason on it', async () => {
    api.refuseUploadOf = { name: 'grande.png', failure: { kind: 'attachment_too_large' } };
    renderDialog();
    await fillBug();
    await userEvent.upload(
      screen.getByLabelText('Anexar prints'),
      new File(['png'], 'grande.png', { type: 'image/png' }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Enviar relato' }));

    expect(
      await within(screen.getByRole('list', { name: 'Prints' })).findByText(
        'O print passa de 5 MB.',
      ),
    ).toBeInTheDocument();
    expect(api.sent).toEqual([]);
  });

  it('10 waiting already is said above the button and the form stays', async () => {
    api.failNext = { kind: 'open_limit' };
    renderDialog();
    await fillBug();

    await userEvent.click(screen.getByRole('button', { name: 'Enviar relato' }));

    expect(
      await screen.findByText(
        'Você já tem 10 relatos esperando análise. Espere a equipe olhar algum deles.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('O que aconteceu')).toHaveValue('O token voltou');
  });

  it('too many in a row names the wait in minutes', async () => {
    api.failNext = { kind: 'rate_limited', retryAfterSeconds: 600 };
    renderDialog();
    await fillBug();

    await userEvent.click(screen.getByRole('button', { name: 'Enviar relato' }));

    expect(
      await screen.findByText('Muitos relatos seguidos. Tente de novo em 10 min.'),
    ).toBeInTheDocument();
  });

  it('"Fechar" after sending closes the dialog', async () => {
    const onOpenChange = renderDialog();
    await fillBug();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar relato' }));

    const sent = (await screen.findByRole('status')).parentElement ?? document.body;
    await userEvent.click(within(sent).getByRole('button', { name: 'Fechar' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
