import { isHexColor, type MemberColorDto } from '@lorkarium/contracts';
import { initialsOf } from '@lorkarium/game-core';
import { useState, type CSSProperties } from 'react';
import { legibleInkOn } from '@/lib/color-contrast';
import { memberColorCss } from '@/lib/member-color';
import { cn } from '@/lib/utils';

export type UserAvatarSize = 'sm' | 'md' | 'lg' | 'xl';

export type UserAvatarProps = Readonly<{
  /** The nickname: its initials stand in when there is no photo. */
  name: string;
  /** The effective color: the background of the initials. */
  color: MemberColorDto;
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
        style={initialsStyleOf(color)}
        className={cn(
          frame,
          'grid place-items-center font-brand font-semibold',
          !isHexColor(color) && 'text-panel',
        )}
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

// The palette is bright enough for the panel ink; a custom color can be anything.
function initialsStyleOf(color: MemberColorDto): CSSProperties {
  const backgroundColor = memberColorCss(color);
  return isHexColor(color) ? { backgroundColor, color: legibleInkOn(color) } : { backgroundColor };
}

function avatarUrlOf(avatarId: string): string {
  return `/api/avatars/${avatarId}`;
}
