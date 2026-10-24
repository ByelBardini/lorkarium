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
import { Input } from '@/components/ui/input';
import { adminFailureMessage, deletionConsequence } from './admin-messages';
import { useOnceOnMount } from '@/lib/use-once-on-mount';
import { useOnUsersSettled, usersFailureOf, useUsersFetcher } from './use-users-fetcher';

export type DeleteUserDialogProps = Readonly<{
  user: AdminUserDto;
  onDeleted: () => void;
  /** "Suspender em vez disso", when tables block the deletion. */
  onSuspendInstead: () => void;
  onClose: () => void;
}>;

/** "Excluir usuário": loads what the deletion would take; tables where others play block it (and
 *  offer to suspend), otherwise typing the @ unlocks "Excluir".
 *
 *  Example: `<DeleteUserDialog user={bia} onDeleted={…} onSuspendInstead={…} onClose={…} />` */
export function DeleteUserDialog(props: DeleteUserDialogProps): React.JSX.Element {
  const check = useUsersFetcher();
  const deletion = useUsersFetcher();
  useOnceOnMount(() => check.send({ intent: 'deletion-check', userId: props.user.id }));
  useOnUsersSettled(deletion.settled, (result) => {
    if ('done' in result) props.onDeleted();
  });
  const blocking = blockingOf(check.settled, deletion.settled);
  const checked = check.settled && 'check' in check.settled ? check.settled.check : null;
  const failure = usersFailureOf(check.settled) ?? usersFailureOf(deletion.settled);
  return (
    <AlertDialog open onOpenChange={(open) => !open && !deletion.busy && props.onClose()}>
      <AlertDialogContent aria-busy={check.busy || deletion.busy}>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir @{props.user.username}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              {blocking ? (
                <BlockedBody username={props.user.username} campaigns={blocking} />
              ) : checked ? (
                <p>{deletionConsequence(props.user.username, checked.soloCampaigns)}</p>
              ) : (
                <p role="status">Conferindo o que a exclusão apaga…</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure && failure.kind !== 'owns_shared_campaigns' && (
          <Alert variant="destructive" className="px-3.5 py-3 text-sm">
            {adminFailureMessage(failure)}
          </Alert>
        )}
        {blocking ? (
          <BlockedFooter onSuspendInstead={props.onSuspendInstead} />
        ) : (
          checked && (
            <ConfirmByTyping
              user={props.user}
              busy={deletion.busy}
              onConfirm={() => deletion.send({ intent: 'delete', userId: props.user.id })}
            />
          )
        )}
      </AlertDialogContent>
    </AlertDialog>
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

function BlockedBody({
  username,
  campaigns,
}: Readonly<{ username: string; campaigns: readonly BlockingCampaignDto[] }>): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <p>@{username} criou mesas em que outras pessoas jogam:</p>
      <ul className="list-disc pl-5">
        {campaigns.map((campaign) => (
          <li key={campaign.id}>
            {campaign.name} ({othersLabel(campaign.otherMembers)})
          </li>
        ))}
      </ul>
      <p>Excluir a conta tiraria essas mesas de quem joga nelas. Na dúvida, suspenda.</p>
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

function ConfirmByTyping({
  user,
  busy,
  onConfirm,
}: Readonly<{ user: AdminUserDto; busy: boolean; onConfirm: () => void }>): React.JSX.Element {
  const id = useId();
  const [typed, setTyped] = useState('');
  const expected = `@${user.username}`;
  const matches = typed.trim().toLowerCase() === expected;
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
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
        <Button
          variant="destructive"
          size="lg"
          disabled={!matches || busy}
          aria-busy={busy}
          onClick={onConfirm}
        >
          {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
          {busy ? 'Excluindo…' : 'Excluir'}
        </Button>
      </AlertDialogFooter>
    </>
  );
}
