import type { ProfileCardDto, ReputationVoteValue } from '@lorkarium/contracts';
import { MailIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FriendConfirmDialog } from '@/features/friends/friend-confirm-dialog';
import {
  blockConfirmation,
  removeConfirmation,
  type FriendConfirmation,
} from '@/features/friends/friend-confirmations';
import { friendPath } from '@/features/friends/friends-path';
import type { ProfileCardDeps } from './profile-card-deps';
import { runFriendship, type ProfileCardNotice } from './profile-card-friendship';
import { ProfileCardMenu, type ProfileCardMenuChoice } from './profile-card-menu';
import { cardCommandFailureText } from './profile-card-text';
import { ReputationButtons } from './reputation-buttons';
import { ReportUserDialog } from './report-user-dialog';

export type ProfileCardActionsProps = Readonly<{
  card: ProfileCardDto;
  deps: ProfileCardDeps;
  /** Reads the card again after a command (the server is the authority over the counts). */
  reload: () => Promise<void>;
  full: boolean;
}>;

/** The bar under the card: "Mensagem" (an online friend only), 👍/👎 and the ⋯ menu. Removing
 *  and blocking ask first; the result is said in a line under the bar.
 *
 *  Example: `<ProfileCardActions card={card} deps={deps} reload={reload} full={false} />` */
export function ProfileCardActions(props: ProfileCardActionsProps): React.JSX.Element {
  const { card, deps, reload } = props;
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ProfileCardNotice | null>(null);
  const [confirmation, setConfirmation] = useState<FriendConfirmation | null>(null);
  const [reporting, setReporting] = useState(false);
  const friendship = async (choice: Exclude<ProfileCardMenuChoice, 'report'>): Promise<void> => {
    setNotice(await runFriendship(choice, card, deps, reload));
  };
  const choose = (choice: ProfileCardMenuChoice): void => {
    if (choice === 'report') return setReporting(true);
    if (choice === 'remove')
      return setConfirmation(removeConfirmation(card.name, () => void friendship('remove')));
    if (choice === 'block')
      return setConfirmation(blockConfirmation(card.name, () => void friendship('block')));
    void friendship(choice);
  };
  const vote = async (value: ReputationVoteValue | null): Promise<void> => {
    setBusy(true);
    const result =
      value === null ? await deps.api.removeVote(card.id) : await deps.api.vote(card.id, value);
    if (result.ok) await reload();
    setNotice(result.ok ? null : { text: cardCommandFailureText(result.failure), error: true });
    setBusy(false);
  };
  const canMessage = card.relation === 'friend' && card.presence === 'online';
  return (
    <div
      className={cn('border-t border-border bg-background/60 py-3', props.full ? 'px-6' : 'px-4.5')}
    >
      <div className="flex items-center gap-1.5">
        <Button
          className="flex-1"
          disabled={!canMessage}
          onClick={() => void navigate(friendPath(card.id))}
        >
          <MailIcon aria-hidden="true" />
          Mensagem
        </Button>
        <ReputationButtons
          reputation={card.reputation}
          allowed={card.mutualCampaigns.length > 0}
          busy={busy}
          onVote={(value) => void vote(value)}
        />
        <ProfileCardMenu card={card} onChoose={choose} />
      </div>
      {notice && <NoticeLine notice={notice} />}
      <FriendConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />
      <ReportUserDialog
        api={deps.api}
        userId={card.id}
        name={card.name}
        open={reporting}
        onOpenChange={setReporting}
      />
    </div>
  );
}

function NoticeLine({ notice }: Readonly<{ notice: ProfileCardNotice }>): React.JSX.Element {
  return (
    <p
      role={notice.error ? 'alert' : 'status'}
      className={cn(
        'pt-2 text-xs',
        notice.error ? 'text-destructive-text' : 'text-muted-foreground',
      )}
    >
      {notice.text}
    </p>
  );
}
