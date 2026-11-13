import {
  legalDocumentDto,
  presenceVisibilityDto,
  type AuthUserDto,
  type LegalDocument,
  type PresenceVisibilityDto,
} from '@lorkarium/contracts';
import {
  FileTextIcon,
  LockKeyholeIcon,
  LogOutIcon,
  ShieldIcon,
  UserRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { LegalDocumentLink } from '@/components/legal-document-link';
import { PresenceDot, type PresenceDotStatus } from '@/components/presence-dot';
import { UserHandle } from '@/components/user-handle';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LEGAL_DOCUMENT_TITLES } from '@/lib/legal-documents';
import { cn } from '@/lib/utils';
import { sealHolderOfAccount } from '@/lib/plan-seal';

/** The status the account shows its friends: the choice, and whether the tab sits idle. */
export type UserMenuPresence = Readonly<{
  choice: PresenceVisibilityDto;
  away: boolean;
  onChoose: (choice: PresenceVisibilityDto) => void;
}>;

export type UserMenuProps = Readonly<{
  user: AuthUserDto;
  expanded: boolean;
  onSignOut: () => Promise<void>;
  /** Left out, the menu has no status (a frame without the account socket). */
  presence?: UserMenuPresence;
}>;

const CHOICE_LABELS: Readonly<Record<PresenceVisibilityDto, string>> = {
  online: 'Online',
  invisible: 'Invisível',
};

const LEGAL_ICONS: Readonly<Record<LegalDocument, LucideIcon>> = {
  terms: FileTextIcon,
  privacy: LockKeyholeIcon,
};

const ITEM_LINK_CLASS = 'text-foreground no-underline hover:no-underline';

/** The account menu at the foot of the rail, behind the avatar: the e-mail with the stored plan
 *  seals, the status (Online / Invisível, "Ausente" while idle), "Minha conta", Backoffice for
 *  admins, the Terms of use and the Privacy policy (new tab), and "Sair".
 *
 *  Example: `<UserMenu user={user} expanded onSignOut={signOut} />` */
export function UserMenu({
  user,
  expanded,
  onSignOut,
  presence,
}: UserMenuProps): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn('h-10 text-label', expanded ? 'justify-start px-2' : 'justify-center px-0')}
        >
          <span className="relative shrink-0">
            <UserAvatar name={user.name} color={user.color} avatarId={user.avatarId} size="sm" />
            {presence && <PresenceDot status={dotStatusOf(presence)} />}
          </span>
          <span className={expanded ? 'truncate' : 'sr-only'}>{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-52">
        <DropdownMenuLabel className="flex flex-col gap-1.5 font-normal text-muted-foreground">
          <UserHandle username={user.username} seal={sealHolderOfAccount(user)} />
          <span className="truncate">{user.email}</span>
        </DropdownMenuLabel>
        {presence && <PresenceChoiceGroup presence={presence} />}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/account" className={ITEM_LINK_CLASS}>
            <UserRoundIcon aria-hidden="true" />
            Minha conta
          </Link>
        </DropdownMenuItem>
        {user.role === 'admin' && (
          <DropdownMenuItem asChild>
            <Link to="/admin" className={ITEM_LINK_CLASS}>
              <ShieldIcon aria-hidden="true" />
              Backoffice
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {legalDocumentDto.options.map((document) => (
          <LegalMenuItem key={document} document={document} />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void onSignOut()}>
          <LogOutIcon aria-hidden="true" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function dotStatusOf({ choice, away }: UserMenuPresence): PresenceDotStatus {
  if (choice === 'invisible') return 'invisible';
  return away ? 'away' : 'online';
}

function PresenceChoiceGroup({
  presence,
}: Readonly<{ presence: UserMenuPresence }>): React.JSX.Element {
  const { choice, away, onChoose } = presence;
  const pick = (value: string): void => {
    const parsed = presenceVisibilityDto.safeParse(value);
    if (parsed.success) onChoose(parsed.data);
  };
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs text-muted-foreground">
        Seu status{choice === 'online' && away ? ': Ausente' : ''}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup value={choice} onValueChange={pick}>
        {presenceVisibilityDto.options.map((option) => (
          <DropdownMenuRadioItem key={option} value={option}>
            {CHOICE_LABELS[option]}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}

function LegalMenuItem({ document }: Readonly<{ document: LegalDocument }>): React.JSX.Element {
  const Icon = LEGAL_ICONS[document];
  return (
    <DropdownMenuItem asChild>
      <LegalDocumentLink document={document} className={ITEM_LINK_CLASS}>
        <Icon aria-hidden="true" />
        {LEGAL_DOCUMENT_TITLES[document]}
      </LegalDocumentLink>
    </DropdownMenuItem>
  );
}
