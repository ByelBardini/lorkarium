import { legalDocumentDto, type AuthUserDto, type LegalDocument } from '@lorkarium/contracts';
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
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LEGAL_DOCUMENT_TITLES } from '@/lib/legal-documents';
import { cn } from '@/lib/utils';

export type UserMenuProps = Readonly<{
  user: AuthUserDto;
  expanded: boolean;
  onSignOut: () => Promise<void>;
}>;

const LEGAL_ICONS: Readonly<Record<LegalDocument, LucideIcon>> = {
  terms: FileTextIcon,
  privacy: LockKeyholeIcon,
};

const ITEM_LINK_CLASS = 'text-foreground no-underline hover:no-underline';

/** The account menu at the foot of the rail, behind the avatar: "Minha conta", Backoffice for
 *  admins, the Terms of use and the Privacy policy (new tab), and "Sair".
 *
 *  Example: `<UserMenu user={user} expanded onSignOut={signOut} />` */
export function UserMenu({ user, expanded, onSignOut }: UserMenuProps): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn('h-10 text-label', expanded ? 'justify-start px-2' : 'justify-center px-0')}
        >
          <UserAvatar name={user.name} color={user.color} avatarId={user.avatarId} size="sm" />
          <span className={expanded ? 'truncate' : 'sr-only'}>{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-52">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {user.email}
        </DropdownMenuLabel>
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
