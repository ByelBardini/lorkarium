import { useEffect, useRef } from 'react';
import { bannerUrlOf } from '@/lib/banner-url';

const STILL_WIDTH = 600;
const STILL_HEIGHT = 200;
const PICTURE = 'absolute inset-0 size-full object-cover';

export type MemberBannerBackdropProps = Readonly<{
  bannerId: string | null;
  moving: boolean;
}>;

/** The member's profile banner behind their row, faded under the panel color so the text stays
 *  legible. Still by default (its first frame on a canvas); a GIF banner moves only while
 *  `moving`. The row needs `relative isolate`.
 *
 *  Example: `<MemberBannerBackdrop bannerId={member.bannerId} moving={hover.moving} />` */
export function MemberBannerBackdrop({
  bannerId,
  moving,
}: MemberBannerBackdropProps): React.JSX.Element | null {
  if (bannerId === null) return null;
  const url = bannerUrlOf(bannerId);
  return (
    <span
      aria-hidden="true"
      data-banner-backdrop
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <BannerStill url={url} />
      {/* Over the still: while the moving one loads, the first frame stays. */}
      {moving && <img src={url} alt="" className={PICTURE} />}
      <span className="absolute inset-0 bg-linear-to-r from-panel/95 via-panel/80 to-panel/55" />
    </span>
  );
}

// An animated WebP in an <img> always plays; drawn on a canvas it is only its first frame.
function BannerStill({ url }: Readonly<{ url: string }>): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const picture = new Image();
    picture.onload = () =>
      canvas.current?.getContext('2d')?.drawImage(picture, 0, 0, STILL_WIDTH, STILL_HEIGHT);
    picture.src = url;
    return () => {
      picture.onload = null;
    };
  }, [url]);
  return (
    <canvas
      ref={canvas}
      data-banner-still
      width={STILL_WIDTH}
      height={STILL_HEIGHT}
      className={PICTURE}
    />
  );
}
