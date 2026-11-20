import type { AdminUserDto, BlockingCampaignDto } from '@lorkarium/contracts';
import { Loader2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import { FormField } from '@/components/form-field';
import { Alert } from '@/components/ui/alert';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { billingFailureMessage } from '@/features/billing/billing-messages';
import { useOnceOnMount } from '@/lib/use-once-on-mount';
import type { BillingApi } from '@/services/billing-api';
import { adminFailureMessage, deletionConsequence } from './admin-messages';
import { TwoFactorRequiredNote } from './two-factor-required-note';
import {
  useDeletionBilling,
  useRenewalCancel,
  type DeletionBillingState,
  type RenewalCancelStatus,
} from './use-deletion-billing';
import type { BanMeasure } from './sanction-dialog';
import { banConsequence } from './sanction-messages';
import type { UsersIntent } from './users-action';
import { useOnUsersSettled, usersFailureOf, useUsersFetcher } from './use-users-fetcher';

export type DeleteUserDialogProps = Readonly<{
  user: AdminUserDto;
  /** The account's billing, read on open, and the cancel of its card renewal. */
  billingApi: Pick<BillingApi, 'adminAccount' | 'adminCancel'>;
  /** The admin's own 2FA: the billing service only cancels another account's renewal with it. */
  twoFactorOn: boolean;
  /** A deletion that is a measure (a ban, from "Aplicar medida…"): it goes as the measure, which
   *  suspends now, e-mails the reasons and the date, and deletes after the appeal window. Absent =
   *  asked by the person. */
  measure?: BanMeasure;
  /** Done: `deletionDueAt` is the ban's date, `null` for a deletion right away. */
  onDeleted: (deletionDueAt: string | null) => void;
  /** "Suspender em vez disso", when tables block the deletion. */
  onSuspendInstead: () => void;
  onClose: () => void;
}>;

/** "Excluir usuário": loads what the deletion would take, the paid plan included; tables where
 *  others play block it (and offer to suspend) until the admin marks they go too (agreed with the
 *  person); then typing the @ unlocks "Excluir", which cancels the card renewal first and only
 *  then deletes.
 *
 *  Example: `<DeleteUserDialog user={bia} billingApi={api} twoFactorOn onDeleted={…} onSuspendInstead={…} onClose={…} />` */
export function DeleteUserDialog(props: DeleteUserDialogProps): React.JSX.Element {
  const check = useUsersFetcher();
  const deletion = useUsersFetcher();
  const billing = useDeletionBilling(props.billingApi, props.user.id);
  const renewal = useRenewalCancel(props.billingApi, props.user.id);
  useOnceOnMount(() => check.send({ intent: 'deletion-check', userId: props.user.id }));
  const [takeShared, setTakeShared] = useState(false);
  useOnUsersSettled(deletion.settled, (result) => {
    if ('done' in result) props.onDeleted(null);
    else if ('deletionDueAt' in result) props.onDeleted(result.deletionDueAt);
  });
  const blocking = blockingOf(check.settled, deletion.settled);
  const stillBlocked = blocking !== null && !takeShared;
  const checked = check.settled && 'check' in check.settled ? check.settled.check : null;
  const failure = usersFailureOf(check.settled) ?? usersFailureOf(deletion.settled);
  const busy = deletion.busy || renewal.status.kind === 'busy';
  const confirm = async (): Promise<void> => {
    if (mustCancelFirst(billing, renewal.status) && !(await renewal.cancel())) return;
    deletion.send(deletionIntentOf(props.user.id, props.measure, takeShared));
  };
  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && props.onClose()}>
      <AlertDialogContent aria-busy={check.busy || busy}>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir @{props.user.username}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">
              {blocking ? (
                <BlockedBody
                  username={props.user.username}
                  campaigns={blocking}
                  takeShared={takeShared}
                  onTakeShared={setTakeShared}
                />
              ) : checked ? (
                <p>{deletionConsequence(props.user.username, checked.soloCampaigns)}</p>
              ) : (
                <p role="status">Conferindo o que a exclusão apaga…</p>
              )}
              {!stillBlocked && billing.kind === 'read' && billing.line !== null && (
                <p>{billing.line}</p>
              )}
              {!stillBlocked && props.measure && <p>{banConsequence(props.measure.rule)}</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure && failure.kind !== 'owns_shared_campaigns' && (
          <Alert variant="destructive" className="px-3.5 py-3 text-sm">
            {adminFailureMessage(failure)}
          </Alert>
        )}
        {!stillBlocked && <DeletionBillingAlert billing={billing} renewal={renewal.status} />}
        {stillBlocked ? (
          <BlockedFooter onSuspendInstead={props.onSuspendInstead} />
        ) : (
          checked &&
          billing.kind !== 'loading' && (
            <ConfirmByTyping
              user={props.user}
              idleLabel={props.measure ? 'Suspender e agendar a exclusão' : 'Excluir'}
              busyLabel={busyLabelOf(deletion.busy, renewal.status)}
              anyway={billing.kind === 'unread' || renewal.status.kind === 'failed'}
              needsTwoFactor={mustCancelFirst(billing, renewal.status) && !props.twoFactorOn}
              onConfirm={() => void confirm()}
            />
          )
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function deletionIntentOf(
  userId: string,
  measure: BanMeasure | undefined,
  takeShared: boolean,
): UsersIntent {
  const shared = takeShared ? { includeSharedCampaigns: true } : {};
  if (!measure) return { intent: 'delete', userId, ...shared };
  return { intent: 'sanction', userId, sanction: { kind: 'ban', ...measure, ...shared } };
}

// A failed cancel is not retried: the admin chose "Excluir mesmo assim" and the hourly
// reconciliation of the billing service stops what is left.
function mustCancelFirst(billing: DeletionBillingState, renewal: RenewalCancelStatus): boolean {
  return billing.kind === 'read' && billing.renewing !== null && renewal.kind === 'idle';
}

function busyLabelOf(deleting: boolean, renewal: RenewalCancelStatus): string | null {
  if (renewal.kind === 'busy') return 'Cancelando a renovação…';
  return deleting ? 'Excluindo…' : null;
}

const RECONCILED_WITHIN_AN_HOUR = 'a cobrança cancela sozinha em até 1 hora.';

function DeletionBillingAlert({
  billing,
  renewal,
}: Readonly<{ billing: DeletionBillingState; renewal: RenewalCancelStatus }>) {
  const message =
    billing.kind === 'unread'
      ? `Não deu para conferir a cobrança da conta. Se excluir mesmo assim e houver renovação no cartão, ${RECONCILED_WITHIN_AN_HOUR}`
      : renewal.kind === 'failed'
        ? `${billingFailureMessage(renewal.failure, 'cancelar a renovação')} Se excluir mesmo assim, ${RECONCILED_WITHIN_AN_HOUR}`
        : null;
  if (message === null) return null;
  return (
    <Alert variant="destructive" className="px-3.5 py-3 text-sm">
      {message}
    </Alert>
  );
}

function blockingOf(
  check: ReturnType<typeof useUsersFetcher>['settled'],
  deletion: ReturnType<typeof useUsersFetcher>['settled'],
): BlockingCampaignDto[] | null {
  // Someone may join a table between the check and the click: the refusal carries the tables.
  const refused = usersFailureOf(deletion);
  if (refused?.kind === 'owns_shared_campaigns') return refused.blockingCampaigns;
  if (check && 'check' in check && check.check.blockingCampaigns.length > 0) {
    return check.check.blockingCampaigns;
  }
  return null;
}

function othersLabel(count: number): string {
  return count === 1 ? '1 outra pessoa' : `${count} outras pessoas`;
}

type BlockedBodyProps = Readonly<{
  username: string;
  campaigns: readonly BlockingCampaignDto[];
  takeShared: boolean;
  onTakeShared: (take: boolean) => void;
}>;

function BlockedBody(props: BlockedBodyProps): React.JSX.Element {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <p>@{props.username} criou mesas em que outras pessoas jogam:</p>
      <ul className="list-disc pl-5">
        {props.campaigns.map((campaign) => (
          <li key={campaign.id}>
            {campaign.name} ({othersLabel(campaign.otherMembers)})
          </li>
        ))}
      </ul>
      <p>Excluir a conta tiraria essas mesas de quem joga nelas. Na dúvida, suspenda.</p>
      <div className="flex items-start gap-2 text-foreground">
        <Checkbox
          id={id}
          checked={props.takeShared}
          onCheckedChange={(state) => props.onTakeShared(state === true)}
          className="mt-0.5"
        />
        <Label htmlFor={id} className="font-normal">
          Apagar também estas mesas (combinado com a pessoa)
        </Label>
      </div>
    </div>
  );
}

function BlockedFooter({
  onSuspendInstead,
}: Readonly<{ onSuspendInstead: () => void }>): React.JSX.Element {
  return (
    <AlertDialogFooter>
      <AlertDialogCancel>Fechar</AlertDialogCancel>
      <Button size="lg" onClick={onSuspendInstead}>
        Suspender em vez disso
      </Button>
    </AlertDialogFooter>
  );
}

type ConfirmByTypingProps = Readonly<{
  user: AdminUserDto;
  /** What the button says when idle: "Excluir", or the ban's scheduling. */
  idleLabel: string;
  /** What the button says while it works; `null` when idle. */
  busyLabel: string | null;
  /** The billing could not be read or its renewal not cancelled: "Excluir mesmo assim". */
  anyway: boolean;
  /** A renewal to cancel first and no 2FA on the admin's account: disabled, with the reason. */
  needsTwoFactor: boolean;
  onConfirm: () => void;
}>;

function ConfirmByTyping(props: ConfirmByTypingProps): React.JSX.Element {
  const id = useId();
  const [typed, setTyped] = useState('');
  const expected = `@${props.user.username}`;
  const matches = typed.trim().toLowerCase() === expected;
  const busy = props.busyLabel !== null;
  return (
    <>
      <FormField id={id} label={`Digite ${expected} para confirmar`} error={undefined}>
        <Input
          id={id}
          value={typed}
          autoComplete="off"
          onChange={(event) => setTyped(event.target.value)}
        />
      </FormField>
      {props.needsTwoFactor && (
        <TwoFactorRequiredNote action="cancelar a renovação antes de excluir" />
      )}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
        <Button
          variant="destructive"
          size="lg"
          disabled={!matches || busy || props.needsTwoFactor}
          aria-busy={busy}
          onClick={props.onConfirm}
        >
          {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
          {props.busyLabel ?? (props.anyway ? `${props.idleLabel} mesmo assim` : props.idleLabel)}
        </Button>
      </AlertDialogFooter>
    </>
  );
}
