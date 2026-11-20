import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReportUserDialog } from '@/features/profile-card/report-user-dialog';
import { ProfileCardApiFake } from '../../support/profile-card-api-fake';
import { LYRA_CARD } from '../../support/profile-card-fixtures';

const KAEL = { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', name: 'Ruínas de Kael' };
const VARN = { id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'A Queda de Varn' };
const FIVE_MIB = 5 * 1024 * 1024;

const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
let api: ProfileCardApiFake;

function shot(name: string, type = 'image/png', size = 10): File {
  return new File([new Uint8Array(size)], name, { type });
}

function renderDialog(campaigns = [VARN, KAEL]): HTMLElement {
  render(
    <ReportUserDialog
      api={api}
      userId={LYRA_CARD.id}
      name="Lyra Valen"
      campaigns={campaigns}
      open
      onOpenChange={() => undefined}
    />,
  );
  return screen.getByRole('dialog', { name: 'Denunciar Lyra Valen' });
}

async function attach(dialog: HTMLElement, ...files: File[]): Promise<void> {
  const user = userEvent.setup({ applyAccept: false });
  await user.upload(within(dialog).getByLabelText('Anexar prints'), files);
}

async function chooseSpam(dialog: HTMLElement): Promise<void> {
  await userEvent.click(within(dialog).getByRole('radio', { name: 'Spam' }));
}

function sendButton(dialog: HTMLElement): HTMLElement {
  return within(dialog).getByRole('button', { name: 'Enviar denúncia' });
}

beforeEach(() => {
  api = new ProfileCardApiFake();
  URL.createObjectURL = (blob: Blob) => `blob:${blob instanceof File ? blob.name : 'x'}`;
  URL.revokeObjectURL = () => undefined;
});

afterEach(() => {
  URL.createObjectURL = original.create;
  URL.revokeObjectURL = original.revoke;
});

describe('ReportUserDialog with a table and screenshots', () => {
  it('sends the kept screenshots first, then the report with the table and their ids', async () => {
    const dialog = renderDialog();
    await chooseSpam(dialog);
    const table = within(dialog).getByRole('combobox', { name: 'Mesa onde aconteceu (opcional)' });
    await userEvent.selectOptions(table, 'Ruínas de Kael');
    await attach(dialog, shot('um.png'), shot('dois.png'));
    expect(
      within(dialog)
        .getAllByRole('img')
        .map((img) => img.getAttribute('alt')),
    ).toEqual(['Print 1', 'Print 2']);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover print 1' }));
    await userEvent.click(sendButton(dialog));

    expect(await within(dialog).findByText('Denúncia enviada.')).toBeInTheDocument();
    expect(api.answers.calls.map((call) => call.method)).toEqual([
      'uploadReportAttachment',
      'report',
    ]);
    expect(api.answers.callsOf('uploadReportAttachment')).toEqual(['dois.png']);
    expect(api.answers.callsOf('report')).toEqual([
      {
        userId: LYRA_CARD.id,
        report: { reason: 'spam', details: null, campaignId: KAEL.id, attachmentIds: api.uploads },
      },
    ]);
  });

  it('a 6th screenshot is refused with the limit and the 5 stay', async () => {
    const dialog = renderDialog();
    const five = ['1', '2', '3', '4', '5'].map((index) => shot(`${index}.png`));

    await attach(dialog, ...five, shot('6.png'));

    expect(within(dialog).getAllByRole('img')).toHaveLength(5);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Até 5 prints por denúncia.');
  });

  it('a screenshot past 5 MB is refused before any upload and the report leaves without it', async () => {
    const dialog = renderDialog();
    await chooseSpam(dialog);

    await attach(dialog, shot('grande.png', 'image/png', FIVE_MIB + 1));

    expect(within(dialog).getByRole('alert')).toHaveTextContent('O print passa de 5 MB.');
    expect(within(dialog).queryAllByRole('img')).toEqual([]);
    await userEvent.click(sendButton(dialog));
    expect(await within(dialog).findByText('Denúncia enviada.')).toBeInTheDocument();
    expect(api.answers.callsOf('uploadReportAttachment')).toEqual([]);
  });

  it('a GIF is refused naming the accepted types', async () => {
    const dialog = renderDialog();

    await attach(dialog, shot('anim.gif', 'image/gif'));

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Envie um PNG, JPEG ou WebP.');
    expect(within(dialog).queryAllByRole('img')).toEqual([]);
  });

  it('an upload that fails shows the error on that screenshot and sends no report', async () => {
    api.refuseUploadOf('dois.png', { kind: 'unsupported_image' });
    const dialog = renderDialog();
    await chooseSpam(dialog);
    await attach(dialog, shot('um.png'), shot('dois.png'));

    await userEvent.click(sendButton(dialog));

    const second = await within(dialog).findByRole('listitem', { name: 'Print 2' });
    expect(within(second).getByText(/não é um PNG, JPEG ou WebP/)).toBeInTheDocument();
    expect(api.answers.callsOf('report')).toEqual([]);
  });

  it('sending again after a failed upload does not upload the kept one twice', async () => {
    api.refuseUploadOf('dois.png', { kind: 'offline' });
    const dialog = renderDialog();
    await chooseSpam(dialog);
    await attach(dialog, shot('um.png'), shot('dois.png'));
    await userEvent.click(sendButton(dialog));
    await within(dialog).findByText(/Sem conexão/);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover print 2' }));
    await userEvent.click(sendButton(dialog));

    expect(await within(dialog).findByText('Denúncia enviada.')).toBeInTheDocument();
    expect(api.answers.callsOf('uploadReportAttachment')).toEqual(['um.png', 'dois.png']);
  });

  it('without a table in common the table field does not show', () => {
    const dialog = renderDialog([]);

    expect(within(dialog).queryByRole('combobox')).toBeNull();
  });

  it('a table the server says they do not share shows the refusal', async () => {
    api.answers.answer('report', { ok: false, failure: { kind: 'campaign_not_shared' } });
    const dialog = renderDialog();
    await chooseSpam(dialog);

    await userEvent.click(sendButton(dialog));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Vocês não jogam juntos nessa mesa.',
    );
  });
});
