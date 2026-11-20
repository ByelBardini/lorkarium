import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DataExportSection } from '@/features/account/data-export-section';
import { BILLING_EXPORT_EMPTY, BillingApiFake } from '../../support/billing-api-fake';
import { DataExportApiFake, EXPORT_FILE_NAME } from '../../support/data-export-api-fake';
import { FileDownloadFake } from '../../support/file-download-fake';

// 10:00 on the person's clock: the server's 16200 s put the next export at 14:30 the same day.
const NOW = new Date(2026, 10, 19, 10, 0);

describe('DataExportSection', () => {
  let exports: DataExportApiFake;
  let billing: BillingApiFake;
  let files: FileDownloadFake;

  beforeEach(() => {
    exports = new DataExportApiFake();
    billing = new BillingApiFake();
    files = new FileDownloadFake();
    render(
      <DataExportSection
        dataExportApi={exports}
        billingApi={billing}
        fileDownload={files}
        username="ana"
        now={() => NOW}
      />,
    );
  });

  const exportButton = (): HTMLElement => screen.getByRole('button', { name: 'Baixar meus dados' });
  const paymentButton = (): HTMLElement =>
    screen.getByRole('button', { name: 'Dados de pagamento' });

  it('"Baixar meus dados" hands the ZIP to the browser under the name the server gave', async () => {
    await userEvent.click(exportButton());

    expect(files.blobs).toEqual([{ blob: exports.archive, fileName: EXPORT_FILE_NAME }]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('while the archive is being made the button says so and cannot be clicked again', async () => {
    const answer = exports.answers.hold('exportData');

    await userEvent.click(exportButton());

    const busy = screen.getByRole('button', { name: 'Preparando o arquivo…' });
    expect(busy).toBeDisabled();
    answer({ ok: false, failure: { kind: 'unexpected' } });
    expect(await screen.findByRole('button', { name: 'Baixar meus dados' })).toBeEnabled();
  });

  it('EXPORT_TOO_SOON tells the hour the next one can be asked, and saves nothing', async () => {
    exports.answers.answer('exportData', {
      ok: false,
      failure: { kind: 'too_soon', retryAfterSeconds: 16200 },
    });

    await userEvent.click(exportButton());

    expect(screen.getByRole('alert')).toHaveTextContent('Você poderá baixar de novo às 14:30.');
    expect(files.blobs).toEqual([]);
  });

  it('"Dados de pagamento" downloads what the billing service exported, as JSON', async () => {
    await userEvent.click(paymentButton());

    expect(billing.answers.callsOf('exportOwn')).toHaveLength(1);
    expect(files.saves).toEqual([
      {
        text: JSON.stringify(BILLING_EXPORT_EMPTY, null, 2),
        fileName: 'lorkarium-pagamentos-ana-2026-11-19.json',
        type: 'application/json',
      },
    ]);
  });

  it('the billing service down shows the failure only on its button', async () => {
    billing.answers.answer('exportOwn', { ok: false, failure: { kind: 'unexpected' } });

    await userEvent.click(paymentButton());

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'O serviço de cobrança não respondeu agora. Tente de novo em instantes.',
    );
    expect(paymentButton()).toHaveAccessibleDescription(
      'O serviço de cobrança não respondeu agora. Tente de novo em instantes.',
    );
    expect(exportButton()).not.toHaveAccessibleDescription();
  });

  it('a payment failure does not keep "Baixar meus dados" from working', async () => {
    billing.answers.answer('exportOwn', { ok: false, failure: { kind: 'offline' } });
    await userEvent.click(paymentButton());

    await userEvent.click(exportButton());

    expect(files.blobs).toHaveLength(1);
  });
});
