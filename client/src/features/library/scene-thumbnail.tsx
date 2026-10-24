import type { LibrarySceneDto } from '@lorkarium/contracts';
import { EyeIcon, LockIcon } from 'lucide-react';
import { assetUrlOf } from '@/services/assets-api';

type SceneThumbnailProps = Readonly<{ scene: LibrarySceneDto; live: boolean; liveText: string }>;

/** The background of the grid, or the grid pattern with its size; the marks over it.
 *
 *  Example: `<SceneThumbnail scene={scene} live liveText="No ar" />` */
export function SceneThumbnail({ scene, live, liveText }: SceneThumbnailProps): React.JSX.Element {
  const isPublic = scene.visibility === 'public';
  return (
    <span className="relative block aspect-[16/10] w-full overflow-hidden bg-panel bg-[linear-gradient(rgb(197_164_109/0.08)_1px,transparent_1px),linear-gradient(90deg,rgb(197_164_109/0.08)_1px,transparent_1px)] bg-[size:14px_14px]">
      {scene.background ? (
        <img
          src={assetUrlOf(scene.background.assetId)}
          alt={scene.name}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center font-display text-2xl text-muted-foreground"
        >
          {`${scene.widthCells}×${scene.heightCells}`}
        </span>
      )}
      <span
        aria-hidden="true"
        className="absolute top-2 left-2 inline-flex items-center gap-1.5 bg-panel/90 px-2 py-1 text-[11px] font-semibold tracking-[0.12em] text-label uppercase [&_svg]:size-3"
      >
        {isPublic ? <EyeIcon /> : <LockIcon />}
        {isPublic ? 'Público' : 'Privado'}
      </span>
      {live && (
        <span
          aria-hidden="true"
          className="absolute top-2 right-2 inline-flex items-center gap-1.5 bg-panel/90 px-2 py-1 text-[11px] font-semibold tracking-[0.12em] text-primary uppercase"
        >
          <span className="size-1.5 bg-primary" />
          {liveText}
        </span>
      )}
    </span>
  );
}
