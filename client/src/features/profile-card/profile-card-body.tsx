import { Button } from '@/components/ui/button';
import type { ProfileCardDeps } from './profile-card-deps';
import { ProfileCardActions } from './profile-card-actions';
import { ProfileCardFace } from './profile-card-face';
import { cardLoadFailureText } from './profile-card-text';
import { ReputationTally } from './reputation-buttons';
import type { ProfileCardRead } from './use-profile-card';

export type ProfileCardBodyProps = Readonly<{
  read: ProfileCardRead;
  deps: ProfileCardDeps;
  full: boolean;
  /** Under the actions (the popover's "Ver perfil completo"). */
  footer?: React.ReactNode;
}>;

/** The card as it stands: loading, the error with "Tentar de novo", or the face with the actions
 *  (on the reader's own card, only the vote counts).
 *
 *  Example: `<ProfileCardBody read={read} deps={deps} full={false} footer={more} />` */
export function ProfileCardBody({
  read,
  deps,
  full,
  footer,
}: ProfileCardBodyProps): React.JSX.Element {
  const { state } = read;
  if (state.kind === 'loading') {
    return <p className="p-4 text-sm text-muted-foreground">Carregando perfil…</p>;
  }
  if (state.kind === 'failed') {
    return (
      <div className="flex flex-col items-start gap-2 p-4">
        <p role="alert" className="text-sm text-destructive-text">
          {cardLoadFailureText(state.failure)}
        </p>
        <Button variant="outline" size="sm" onClick={() => void read.reload()}>
          Tentar de novo
        </Button>
      </div>
    );
  }
  const own = state.card.id === deps.viewerId || state.card.relation === 'self';
  return (
    <ProfileCardFace card={state.card} full={full}>
      {own && <ReputationTally reputation={state.card.reputation} />}
      {!own && (
        <ProfileCardActions card={state.card} deps={deps} reload={read.reload} full={full} />
      )}
      {footer}
    </ProfileCardFace>
  );
}
