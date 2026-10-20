import { useState } from 'react';
import { assetUrlOf } from '@/services/assets-api';
import { cn } from '@/lib/utils';

export type TokenFaceProps = Readonly<{
  initials: string;
  imageAssetId: string | null;
  round: boolean;
  /** Size, border and the text size of the initials. */
  className?: string;
  /** Empty when the face sits beside the name; a name when it stands alone. */
  alt?: string;
}>;

/** The face of a token: its image, or its initials when it has none or the image fails to load
 *  (the same fallback as the board).
 *
 *  Example: `<TokenFace initials="LY" imageAssetId={token.imageAssetId} round className="size-7" />` */
export function TokenFace(props: TokenFaceProps): React.JSX.Element {
  const { initials, imageAssetId, round } = props;
  const [brokenId, setBrokenId] = useState<string | null>(null);
  const frame = cn(round && 'rounded-full', props.className);
  if (imageAssetId === null || brokenId === imageAssetId) {
    return (
      <span aria-hidden="true" className={cn(frame, 'grid place-items-center font-semibold')}>
        {initials}
      </span>
    );
  }
  return (
    <img
      src={assetUrlOf(imageAssetId)}
      alt={props.alt ?? ''}
      onError={() => setBrokenId(imageAssetId)}
      className={cn(frame, 'object-cover')}
    />
  );
}
