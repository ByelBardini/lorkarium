import type { SessionMemberDto } from '@lorkarium/contracts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UserAvatar } from '@/components/user-avatar';

/** The nickname on the "Na mesa" tab as a button that opens the member's card: avatar,
 *  nickname, @ and the "Sobre você" bio (no bio, no line). Esc or a click outside closes it.
 *
 *  Example: `<MemberCardPopover member={bia} />` */
export function MemberCardPopover({
  member,
}: Readonly<{ member: SessionMemberDto }>): React.JSX.Element {
  return (
    <Popover>
      <PopoverTrigger className="min-w-0 cursor-pointer truncate text-left underline-offset-2 hover:text-foreground hover:underline focus-visible:text-foreground">
        {member.name}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={`Cartão de ${member.name}`}
        className="w-64 gap-3 p-3"
      >
        <div className="flex items-center gap-3">
          <UserAvatar
            name={member.name}
            color={member.color}
            avatarId={member.avatarId}
            size="lg"
          />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-display text-base text-foreground">{member.name}</span>
            <span className="truncate text-xs text-muted-foreground">{`@${member.username}`}</span>
          </div>
        </div>
        {member.bio && (
          <p className="text-[13px] leading-relaxed whitespace-pre-line text-label">{member.bio}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
