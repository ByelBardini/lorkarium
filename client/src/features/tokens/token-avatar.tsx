import type { TokenDto } from '@lorkarium/contracts';
import { sideRingVar } from '@/lib/token-side';
import { cn } from '@/lib/utils';
import { TokenFace } from './token-face';

export type TokenAvatarProps = Readonly<{
  token: Pick<TokenDto, 'initials' | 'imageAssetId' | 'frame' | 'side'>;
  /** `sm` for a member under its group. */
  size?: 'sm' | 'md';
  className?: string;
}>;

/** The token's face in the panel: its image in its frame, or its initials, with the ring of its
 *  side (the same tone as on the board).
 *
 *  Example: `<TokenAvatar token={kael} />` */
export function TokenAvatar({ token, size = 'md', className }: TokenAvatarProps) {
  return (
    <span
      className={cn('shrink-0', token.frame === 'round' && 'rounded-full', className)}
      style={{ boxShadow: `0 0 0 2px ${sideRingVar(token.side)}` }}
    >
      <TokenFace
        initials={token.initials}
        imageAssetId={token.imageAssetId}
        round={token.frame === 'round'}
        className={cn(
          'bg-muted text-foreground',
          size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-[11px]',
        )}
      />
    </span>
  );
}
