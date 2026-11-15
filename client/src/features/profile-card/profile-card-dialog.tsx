import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { ProfileCardDeps } from './profile-card-deps';
import { ProfileCardBody } from './profile-card-body';
import type { ProfileCardRead } from './use-profile-card';

export type ProfileCardDialogProps = Readonly<{
  name: string;
  read: ProfileCardRead;
  deps: ProfileCardDeps;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>;

/** "Perfil completo de Bia": the card in a modal, wider, with systems and settings, schedule,
 *  contact, friends and tables in common.
 *
 *  Example: `<ProfileCardDialog name="Bia" read={read} deps={deps} open onOpenChange={setOpen} />` */
export function ProfileCardDialog(props: ProfileCardDialogProps): React.JSX.Element {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="gap-0 border-0 bg-transparent p-0 sm:max-w-[640px]"
      >
        <DialogTitle className="sr-only">{`Perfil completo de ${props.name}`}</DialogTitle>
        <ProfileCardBody read={props.read} deps={props.deps} full />
      </DialogContent>
    </Dialog>
  );
}
