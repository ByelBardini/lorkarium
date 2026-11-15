import {
  USER_REPORT_DETAILS_MAX_LENGTH,
  USER_REPORT_REASONS,
  type UserReportReason,
} from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import type { ProfileCardApi } from '@/services/profile-card-api';
import { cardCommandFailureText, REPORT_REASON_LABELS } from './profile-card-text';

export type ReportUserDialogProps = Readonly<{
  api: ProfileCardApi;
  userId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>;

type ReportStage = 'editing' | 'sending' | 'sent';

/** "Denunciar Bia": a reason from the list (required) and optional details, sent to the admins'
 *  queue. The reporter hears nothing back beyond "Denúncia enviada".
 *
 *  Example: `<ReportUserDialog api={api} userId={card.id} name={card.name} open onOpenChange={setOpen} />` */
export function ReportUserDialog(props: ReportUserDialogProps): React.JSX.Element {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{`Denunciar ${props.name}`}</DialogTitle>
          <DialogDescription>
            A denúncia vai para a equipe do Lorkarium. A pessoa não fica sabendo quem denunciou.
          </DialogDescription>
        </DialogHeader>
        {props.open && <ReportForm {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function ReportForm({ api, userId, onOpenChange }: ReportUserDialogProps): React.JSX.Element {
  const ids = useId();
  const [reason, setReason] = useState<UserReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [stage, setStage] = useState<ReportStage>('editing');
  const [failure, setFailure] = useState<string | null>(null);
  const send = async (): Promise<void> => {
    if (reason === null) return;
    setStage('sending');
    const result = await api.report(userId, { reason, details: details.trim() || null });
    setStage(result.ok ? 'sent' : 'editing');
    setFailure(result.ok ? null : cardCommandFailureText(result.failure));
  };
  if (stage === 'sent') return <ReportSent onClose={() => onOpenChange(false)} />;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <ReasonChoice groupId={ids} reason={reason} onChange={setReason} />
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${ids}-details`}>Detalhes (opcional)</Label>
        <Textarea
          id={`${ids}-details`}
          value={details}
          maxLength={USER_REPORT_DETAILS_MAX_LENGTH}
          onChange={(event) => setDetails(event.target.value)}
        />
      </div>
      {failure && (
        <Alert variant="destructive">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={reason === null || stage === 'sending'}>
          Enviar denúncia
        </Button>
      </DialogFooter>
    </form>
  );
}

function ReasonChoice({
  groupId,
  reason,
  onChange,
}: Readonly<{
  groupId: string;
  reason: UserReportReason | null;
  onChange: (reason: UserReportReason) => void;
}>): React.JSX.Element {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend id={`${groupId}-reason`} className="mb-2 text-[13px] text-label">
        Motivo
      </legend>
      <RadioGroup
        aria-labelledby={`${groupId}-reason`}
        value={reason ?? ''}
        onValueChange={(next) => {
          const chosen = USER_REPORT_REASONS.find((value) => value === next);
          if (chosen) onChange(chosen);
        }}
        className="grid gap-2 sm:grid-cols-2"
      >
        {USER_REPORT_REASONS.map((value) => (
          <div key={value} className="flex items-center gap-2">
            <RadioGroupItem id={`${groupId}-${value}`} value={value} />
            <Label htmlFor={`${groupId}-${value}`} className="cursor-pointer text-sm">
              {REPORT_REASON_LABELS[value]}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

function ReportSent({ onClose }: Readonly<{ onClose: () => void }>): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-sm text-foreground">
        Denúncia enviada.
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Fechar
        </Button>
      </DialogFooter>
    </div>
  );
}
