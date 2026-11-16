import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ProfileCardBody } from './profile-card-body';
import { useProfileCardDeps } from './profile-card-deps';
import { ProfileCardDialog } from './profile-card-dialog';
import { useProfileCard } from './use-profile-card';

export type ProfileCardTriggerProps = Readonly<{
  userId: string;
  /** The person's name: written on the trigger unless `children` replaces it. */
  name: string;
  /** Another face for the trigger (an icon); then `label` names it. */
  children?: React.ReactNode;
  label?: string;
  className?: string;
}>;

const TRIGGER_CLASS =
  'min-w-0 cursor-pointer truncate text-left underline-offset-2 hover:text-foreground hover:underline focus-visible:text-foreground';

/** A person's name that opens their profile card (popover), with "Ver perfil completo" leading to
 *  the modal. Outside a signed-in shell (no `ProfileCardProvider`) the name is plain text.
 *
 *  Example: `<ProfileCardTrigger userId={member.userId} name={member.name} />` */
export function ProfileCardTrigger(props: ProfileCardTriggerProps): React.JSX.Element {
  const { userId, name, className } = props;
  const deps = useProfileCardDeps();
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const read = useProfileCard(deps?.api ?? null, userId, open || full);
  if (deps === null) return <span className={cn('min-w-0 truncate', className)}>{name}</span>;
  const openFull = (): void => {
    setOpen(false);
    setFull(true);
  };
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger aria-label={props.label} className={cn(TRIGGER_CLASS, className)}>
          {props.children ?? name}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label={`Perfil de ${name}`}
          collisionPadding={8}
          className="max-h-(--radix-popover-content-available-height) w-auto gap-0 overflow-y-auto border-0 bg-transparent p-0"
        >
          <ProfileCardBody
            read={read}
            deps={deps}
            full={false}
            footer={<MoreLink onClick={openFull} />}
          />
        </PopoverContent>
      </Popover>
      <ProfileCardDialog name={name} read={read} deps={deps} open={full} onOpenChange={setFull} />
    </>
  );
}

function MoreLink({ onClick }: Readonly<{ onClick: () => void }>): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full border-t border-border py-2.5 text-center font-brand text-[10.5px] font-semibold tracking-[0.14em] text-primary uppercase hover:bg-muted/40"
    >
      Ver perfil completo
    </button>
  );
}
