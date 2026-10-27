import type { SessionMemberDto } from '@lorkarium/contracts';
import { UserAvatar, type UserAvatarProps } from '@/components/user-avatar';
import { presenceOf } from '@/lib/member-presence';
import { PresenceMark } from './presence-mark';

export type RowAvatarProps = Readonly<{
  member: SessionMemberDto;
  size?: UserAvatarProps['size'];
  /** The contour that tells the section apart (gold for a master, red for a juggernaut). */
  className?: string;
}>;

/** The avatar of a compact row of the "Na mesa" tab (master, juggernaut, spectator), with the
 *  presence badge on its corner.
 *
 *  Example: `<RowAvatar member={member} size="lg" className="outline-2 outline-offset-2 outline-primary" />` */
export function RowAvatar({ member, size, className }: RowAvatarProps): React.JSX.Element {
  return (
    <span className="relative shrink-0">
      <UserAvatar
        name={member.name}
        color={member.color}
        avatarId={member.avatarId}
        size={size}
        className={className}
      />
      <PresenceMark
        presence={presenceOf(member)}
        placement="badge"
        className="-right-0.5 -bottom-0.5"
      />
    </span>
  );
}
