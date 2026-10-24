import { LoaderCircleIcon, RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { CopyCodeButton } from '@/components/copy-code-button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { formatCampaignCode } from '@/lib/campaign-code';
import type { Clipboard } from '@/services/clipboard';
import { commandFailureMessage } from './campaign-messages';
import {
  settingsFailureOf,
  useOnSettingsSettled,
  useSettingsFetcher,
} from './use-settings-fetcher';

export type JoinCodeSettingProps = Readonly<{
  campaignId: string;
  code: string;
  clipboard: Clipboard;
}>;

/** The join code with "Copiar código" and "Gerar outro": an immediate command of its own (not
 *  part of the save bar), confirmed first because the old code stops working.
 *
 *  Example: `<JoinCodeSetting campaignId={campaign.id} code={campaign.joinCode} clipboard={clipboard} />` */
export function JoinCodeSetting({
  campaignId,
  code,
  clipboard,
}: JoinCodeSettingProps): React.JSX.Element {
  const fetcher = useSettingsFetcher(campaignId);
  const [confirming, setConfirming] = useState(false);
  const [renewed, setRenewed] = useState(false);
  useOnSettingsSettled(fetcher.settled, (result) => {
    if (!('done' in result)) return;
    setConfirming(false);
    setRenewed(true);
  });
  const failure = settingsFailureOf(fetcher.settled);
  const formatted = formatCampaignCode(code);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] text-label">Código da mesa</span>
      <span className="font-brand text-2xl tracking-[0.2em] text-primary">{formatted}</span>
      <div className="flex flex-wrap items-center gap-3">
        <CopyCodeButton code={formatted} clipboard={clipboard} />
        <Button type="button" variant="outline" size="lg" onClick={() => setConfirming(true)}>
          <RefreshCwIcon aria-hidden="true" />
          Gerar outro
        </Button>
      </div>
      <p role="status" className="text-[13px] text-placeholder">
        {renewed
          ? 'Código novo gerado. O antigo não vale mais.'
          : 'Gerar outro código faz o antigo parar de funcionar. Quem já está na mesa continua.'}
      </p>
      <RegenerateCodeDialog
        open={confirming}
        busy={fetcher.busy}
        failure={failure && commandFailureMessage(failure)}
        onCancel={() => setConfirming(false)}
        onConfirm={() => fetcher.send({ intent: 'regenerate-code' })}
      />
    </div>
  );
}

type RegenerateCodeDialogProps = Readonly<{
  open: boolean;
  busy: boolean;
  failure: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}>;

function RegenerateCodeDialog(props: RegenerateCodeDialogProps): React.JSX.Element {
  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(open) => !open && !props.busy && props.onCancel()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Gerar outro código?</AlertDialogTitle>
          <AlertDialogDescription>
            O código atual para de funcionar na hora. Quem já está na mesa continua.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {props.failure && (
          <p role="alert" className="text-sm text-destructive-text">
            {props.failure}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel size="lg" disabled={props.busy}>
            Cancelar
          </AlertDialogCancel>
          {/* Not an AlertDialogAction: it would close before the server answers. */}
          <Button size="lg" onClick={props.onConfirm} disabled={props.busy} aria-busy={props.busy}>
            {props.busy && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
            {props.busy ? 'Gerando…' : 'Gerar outro código'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
