import type { ProfileCardDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { ProfileCardDeps } from './profile-card-deps';
import { ProfileCardBody } from './profile-card-body';
import { ProfileLookupForm } from './profile-lookup-field';
import { useProfileLookup } from './use-profile-lookup';
import { useProfileCard, type ProfileCardRead } from './use-profile-card';

export type ProfileCardDialogProps = Readonly<{
  name: string;
  read: ProfileCardRead;
  deps: ProfileCardDeps;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>;

/** "Perfil completo de Bia": the card in a modal, wider, with systems and settings, schedule,
 *  contact, friends and tables in common, with "Buscar @usuário" on the banner. A card found by the @ takes
 *  the modal's place until it closes; opening again shows the person of the name.
 *
 *  Example: `<ProfileCardDialog name="Bia" read={read} deps={deps} open onOpenChange={setOpen} />` */
export function ProfileCardDialog(props: ProfileCardDialogProps): React.JSX.Element {
  const [found, setFound] = useState<ProfileCardDto | null>(null);
  const opened = props.read.state.kind === 'ready' ? props.read.state.card.username : null;
  const lookup = useProfileLookup({
    api: props.deps.api,
    shownUsername: found?.username ?? opened,
    onFound: setFound,
  });
  const changeOpen = (open: boolean): void => {
    if (open) return props.onOpenChange(open);
    setFound(null);
    lookup.reset();
    props.onOpenChange(open);
  };
  const field = <ProfileLookupForm {...lookup.form} />;
  return (
    <Dialog open={props.open} onOpenChange={changeOpen}>
      <DialogContent
        aria-describedby={undefined}
        className="gap-3 border-0 bg-transparent p-0 sm:max-w-[640px]"
      >
        <DialogTitle className="sr-only">{`Perfil completo de ${found?.name ?? props.name}`}</DialogTitle>
        {found === null ? (
          <ProfileCardBody read={props.read} deps={props.deps} full corner={field} />
        ) : (
          <FoundProfileCard key={found.id} card={found} deps={props.deps} corner={field} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Keyed by the card's id: each card found starts from what the lookup brought, not read again
// (`active: false`); its votes and friendship commands still reload it.
type FoundProfileCardProps = Readonly<{
  card: ProfileCardDto;
  deps: ProfileCardDeps;
  corner: React.ReactNode;
}>;

function FoundProfileCard({ card, deps, corner }: FoundProfileCardProps): React.JSX.Element {
  const read = useProfileCard(deps.api, card.id, false, card);
  return <ProfileCardBody read={read} deps={deps} full corner={corner} />;
}
