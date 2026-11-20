import {
  USER_REPORT_DETAILS_MAX_LENGTH,
  USER_REPORT_REASONS,
  type UserReportReason,
  type UserReportRequestDto,
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
import { ScreenshotShotsField } from '@/components/screenshot-shots/screenshot-shots-field';
import {
  useScreenshotShots,
  type ScreenshotShots,
  type ScreenshotUploadOutcome,
} from '@/components/screenshot-shots/use-screenshot-shots';
import type { ProfileCardApi } from '@/services/profile-card-api';
import { screenshotFailureText } from '@/components/screenshot-shots/screenshot-failure-text';
import { cardCommandFailureText, REPORT_REASON_LABELS } from './profile-card-text';

/** A table both accounts play: the only ones a report may name. */
export type ReportCampaignOption = Readonly<{ id: string; name: string }>;

export type ReportUserDialogProps = Readonly<{
  api: ProfileCardApi;
  userId: string;
  name: string;
  /** The tables in common (the card's `mutualCampaigns`); empty hides the field. */
  campaigns: readonly ReportCampaignOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>;

type ReportStage = 'editing' | 'sending' | 'sent';

type ReportDraft = Readonly<{
  reason: UserReportReason;
  details: string;
  campaignId: string;
}>;

/** "Denunciar Bia": a reason from the list (required), optional details, the table where it
 *  happened (one in common) and up to 5 screenshots, sent to the admins' queue. The screenshots
 *  go up first; the reporter hears nothing back beyond "Denúncia enviada".
 *
 *  Example: `<ReportUserDialog api={api} userId={card.id} name={card.name} campaigns={card.mutualCampaigns} open onOpenChange={setOpen} />` */
export function ReportUserDialog(props: ReportUserDialogProps): React.JSX.Element {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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

function ReportForm(props: ReportUserDialogProps): React.JSX.Element {
  const ids = useId();
  const [reason, setReason] = useState<UserReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const shots = useScreenshotShots(reportShotsOptionsOf(props.api));
  const { stage, failure, send } = useReportSend(props, shots);
  if (stage === 'sent') return <ReportSent onClose={() => props.onOpenChange(false)} />;
  const sending = stage === 'sending';
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (reason !== null) void send({ reason, details, campaignId });
      }}
    >
      <ReasonChoice groupId={ids} reason={reason} onChange={setReason} />
      <DetailsField id={`${ids}-details`} value={details} onChange={setDetails} />
      <CampaignChoice
        id={`${ids}-campaign`}
        campaigns={props.campaigns}
        value={campaignId}
        onChange={setCampaignId}
      />
      <ScreenshotShotsField shots={shots} disabled={sending} />
      {failure && (
        <Alert variant="destructive">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={reason === null || sending}>
          Enviar denúncia
        </Button>
      </DialogFooter>
    </form>
  );
}

function reportShotsOptionsOf(api: ProfileCardApi): Parameters<typeof useScreenshotShots>[0] {
  const upload = async (file: File): Promise<ScreenshotUploadOutcome> => {
    const result = await api.uploadReportAttachment(file);
    if (result.ok) return { ok: true, id: result.value.id };
    return { ok: false, error: screenshotFailureText(result.failure) };
  };
  return { upload, limitText: 'Até 5 prints por denúncia.' };
}

// The screenshots go up first: one that fails keeps the report from leaving (its error is on it).
function useReportSend(
  { api, userId }: ReportUserDialogProps,
  shots: ScreenshotShots,
): Readonly<{
  stage: ReportStage;
  failure: string | null;
  send: (draft: ReportDraft) => Promise<void>;
}> {
  const [stage, setStage] = useState<ReportStage>('editing');
  const [failure, setFailure] = useState<string | null>(null);
  const send = async (draft: ReportDraft): Promise<void> => {
    setStage('sending');
    setFailure(null);
    const attachmentIds = await shots.uploadAll();
    if (attachmentIds === null) return setStage('editing');
    const result = await api.report(userId, requestOf(draft, attachmentIds));
    setStage(result.ok ? 'sent' : 'editing');
    setFailure(result.ok ? null : cardCommandFailureText(result.failure));
  };
  return { stage, failure, send };
}

function requestOf(draft: ReportDraft, attachmentIds: readonly string[]): UserReportRequestDto {
  return {
    reason: draft.reason,
    details: draft.details.trim() || null,
    ...(draft.campaignId ? { campaignId: draft.campaignId } : {}),
    ...(attachmentIds.length > 0 ? { attachmentIds: [...attachmentIds] } : {}),
  };
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

type TextFieldProps = Readonly<{ id: string; value: string; onChange: (value: string) => void }>;

function DetailsField({ id, value, onChange }: TextFieldProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Detalhes (opcional)</Label>
      <Textarea
        id={id}
        value={value}
        maxLength={USER_REPORT_DETAILS_MAX_LENGTH}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function CampaignChoice({
  campaigns,
  ...field
}: TextFieldProps &
  Readonly<{ campaigns: readonly ReportCampaignOption[] }>): React.JSX.Element | null {
  if (campaigns.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={field.id}>Mesa onde aconteceu (opcional)</Label>
      <select
        id={field.id}
        value={field.value}
        onChange={(event) => field.onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/20"
      >
        <option value="">Nenhuma</option>
        {campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>
            {campaign.name}
          </option>
        ))}
      </select>
    </div>
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
