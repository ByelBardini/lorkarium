import { DownloadIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { BillingApi } from '@/services/billing-api';
import type { DataExportApi } from '@/services/data-export-api';
import type { FileDownload } from '@/services/file-download';
import {
  dataExportFailureMessage,
  paymentExportFailureMessage,
  paymentExportFileName,
} from './data-export-messages';
import { SectionHeading } from './section-heading';
import { SettingsRow } from './settings-row';

export type DataExportSectionProps = Readonly<{
  dataExportApi: DataExportApi;
  billingApi: Pick<BillingApi, 'exportOwn'>;
  fileDownload: FileDownload;
  username: string;
  /** The person's clock, read when an answer comes (the hour of the next export). */
  now: () => Date;
}>;

type DownloadState = Readonly<{ busy: boolean; failure: string | null; start: () => void }>;

/** A download that says, only in its own row, why it did not happen: `run` answers the message
 *  of the failure, or `null` once the file was handed to the browser. */
function useDownload(run: () => Promise<string | null>): DownloadState {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const start = async (): Promise<void> => {
    setBusy(true);
    setFailure(null);
    setFailure(await run());
    setBusy(false);
  };
  return { busy, failure, start: () => void start() };
}

/** "Privacidade": the person's own data as a ZIP (once a day) and, apart, the payment data the
 *  billing service keeps. Both go through the same `<a download>` the app uses, desktop included.
 *
 *  Example: `<DataExportSection dataExportApi={api} billingApi={billing} fileDownload={files} username="ana" now={() => new Date()} />` */
export function DataExportSection(props: DataExportSectionProps): React.JSX.Element {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-6">
      <SectionHeading id={titleId} title="Privacidade">
        Baixe uma cópia do que o Lorkarium guarda sobre você.
      </SectionHeading>
      <div className="flex flex-col">
        <AccountDataRow {...props} />
        <PaymentDataRow {...props} />
      </div>
    </section>
  );
}

function AccountDataRow(props: DataExportSectionProps): React.JSX.Element {
  const download = useDownload(async () => {
    const result = await props.dataExportApi.exportData();
    if (!result.ok) return dataExportFailureMessage(result.failure, props.now());
    props.fileDownload.saveBlob(result.value.blob, result.value.fileName);
    return null;
  });
  return (
    <DownloadRow
      title="Seus dados"
      description="Um arquivo .zip com a conta, o perfil, as mesas em que você está e as imagens que você enviou. Um por dia."
      label="Baixar meus dados"
      busyLabel="Preparando o arquivo…"
      {...download}
    />
  );
}

function PaymentDataRow(props: DataExportSectionProps): React.JSX.Element {
  const download = useDownload(async () => {
    const result = await props.billingApi.exportOwn();
    if (!result.ok) return paymentExportFailureMessage(result.failure);
    const fileName = paymentExportFileName(props.username, props.now());
    props.fileDownload.save(JSON.stringify(result.value, null, 2), fileName, 'application/json');
    return null;
  });
  return (
    <DownloadRow
      title="Pagamentos"
      description="Assinaturas e pagamentos, em JSON. Ficam no serviço de cobrança, por isso vêm à parte."
      label="Dados de pagamento"
      busyLabel="Baixando…"
      {...download}
    />
  );
}

type DownloadRowProps = DownloadState &
  Readonly<{ title: string; description: string; label: string; busyLabel: string }>;

function DownloadRow(props: DownloadRowProps): React.JSX.Element {
  const failureId = useId();
  return (
    <SettingsRow title={props.title} description={props.description} busy={props.busy}>
      <Button
        variant="outline"
        size="lg"
        className="w-fit"
        disabled={props.busy}
        aria-describedby={props.failure === null ? undefined : failureId}
        onClick={props.start}
      >
        <DownloadIcon aria-hidden="true" />
        {props.busy ? props.busyLabel : props.label}
      </Button>
      {props.failure !== null && (
        <p id={failureId} role="alert" className="text-sm text-destructive-text">
          {props.failure}
        </p>
      )}
    </SettingsRow>
  );
}
