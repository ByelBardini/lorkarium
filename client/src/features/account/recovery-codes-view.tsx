import { DownloadIcon } from 'lucide-react';
import { CopyCodeButton } from '@/components/copy-code-button';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { downloadText } from '@/lib/download-text';
import { recoveryCodesText } from '@/lib/two-factor-text';
import type { Clipboard } from '@/services/clipboard';

export type RecoveryCodesViewProps = Readonly<{
  codes: readonly string[];
  username: string;
  clipboard: Clipboard;
  /** Said above the codes, e.g. that the old ones stopped working. */
  warning?: string;
  onDone: () => void;
}>;

/** The 10 recovery codes, shown once: "Copiar códigos", "Baixar .txt" and "Guardei os códigos".
 *  They live only in the dialog's memory; closing it drops them.
 *
 *  Example: `<RecoveryCodesView codes={codes} username="ana" clipboard={clipboard} onDone={close} />` */
export function RecoveryCodesView(props: RecoveryCodesViewProps): React.JSX.Element {
  const { codes, username, clipboard } = props;
  const download = (): void =>
    downloadText(recoveryCodesText(codes, `@${username}`), 'lorkarium-codigos-de-recuperacao.txt');
  return (
    <div className="flex flex-col gap-4">
      {props.warning && <Alert className="px-3.5 py-3 text-sm">{props.warning}</Alert>}
      <p className="text-sm text-muted-foreground">
        Guarde estes códigos num lugar seguro. Se perder o celular, cada um entra uma vez só no
        lugar do código do app.
      </p>
      <ol
        aria-label="Códigos de recuperação"
        className="grid grid-cols-2 gap-x-6 gap-y-1.5 bg-panel px-4 py-3 font-mono text-[15px] text-foreground"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <CopyCodeButton code={codes.join('\n')} clipboard={clipboard} label="Copiar códigos" />
        <Button type="button" variant="outline" size="lg" onClick={download}>
          <DownloadIcon aria-hidden="true" />
          Baixar .txt
        </Button>
      </div>
      <Button type="button" size="lg" className="self-end" onClick={props.onDone}>
        Guardei os códigos
      </Button>
    </div>
  );
}
