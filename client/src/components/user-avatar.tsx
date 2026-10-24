import type { MemberColor } from '@lorkarium/game-core';
import { useState } from 'react';
import { memberColorCss } from '@/lib/member-color';
import { initialsOf } from '@/lib/token-initials';
import { cn } from '@/lib/utils';

export type UserAvatarSize = 'sm' | 'md' | 'lg' | 'xl';

export type UserAvatarProps = Readonly<{
  /** The nickname: its initials stand in when there is no photo. */
  name: string;
  /** The effective color: the background of the initials. */
  color: MemberColor;
  avatarId: string | null;
  size?: UserAvatarSize;
  /** Empty (the default) when the avatar sits beside the name; a name when it stands alone. */
  alt?: string;
  className?: string;
}>;

const SIZE_CLASS: Readonly<Record<UserAvatarSize, string>> = {
  sm: 'size-7 text-[11px]',
  md: 'size-9 text-xs',
  lg: 'size-11 text-[15px]',
  xl: 'size-16 text-xl',
};

/** The photo of an account, or its initials over its color when it has none or the photo fails
 *  to load. A circle: the design system's exception for "a person".
 *
 *  Example: `<UserAvatar name={user.name} color={user.color} avatarId={user.avatarId} size="lg" />` */
export function UserAvatar(props: UserAvatarProps): React.JSX.Element {
  const { name, color, avatarId, size = 'md' } = props;
  const [brokenId, setBrokenId] = useState<string | null>(null);
  const frame = cn('shrink-0 rounded-full', SIZE_CLASS[size], props.className);
  if (avatarId === null || brokenId === avatarId) {
    const label = props.alt ? { role: 'img', 'aria-label': props.alt } : { 'aria-hidden': true };
    return (
      <span
        {...label}
        data-testid="avatar-initials"
        style={{ backgroundColor: memberColorCss(color) }}
        className={cn(frame, 'grid place-items-center font-brand font-semibold text-panel')}
      >
        {initialsOf(name)}
      </span>
    );
  }
  return (
    <img
      data-testid="avatar-photo"
      src={avatarUrlOf(avatarId)}
      alt={props.alt ?? ''}
      onError={() => setBrokenId(avatarId)}
      className={cn(frame, 'bg-muted object-cover')}
    />
  );
}

function avatarUrlOf(avatarId: string): string {
  return `/api/avatars/${avatarId}`;
}
