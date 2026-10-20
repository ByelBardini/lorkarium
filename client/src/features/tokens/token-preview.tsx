import { useState } from 'react';
import { ImageSourceButtons } from '@/components/image-source-buttons';
import { useImageSender, type ImageSender } from '@/components/use-image-sender';
import { barFill } from '@/lib/bar-display';
import { imageOfClipboard } from '@/lib/image-file';
import { parseRangeFields, type SceneDistance } from '@/lib/range-form';
import { sideRingVar } from '@/lib/token-side';
import { cn } from '@/lib/utils';
import type { AssetsApi } from '@/services/assets-api';
import { barSampleOf } from './bar-form-state';
import { BarTrack } from './bar-track';
import { TokenFace } from './token-face';
import { previewMetaOf, type TokenFormValues } from './token-form-state';

export type TokenPreviewProps = Readonly<{
  form: TokenFormValues;
  /** Where a chosen image is sent. */
  image: Readonly<{ campaignId: string; assets: AssetsApi }>;
  /** The image the server kept, or `null` when it was removed. */
  onImage: (assetId: string | null) => void;
  /** The scene's cell: the glow of the light is read in its unit. */
  distance: SceneDistance;
}>;

// One cell of the illustration, and the largest the disc grows (a 4 × 4 already fills it).
const CELL_PX = 52;
const MAX_DISC_PX = 216;
// The glow may pass the stage (it is clipped there), but not grow without end.
const MAX_GLOW_PX = 560;

/** The column beside the tabs: the token as it will look (ring of its side, image or initials,
 *  its first bar, the glow of its light) with its name and a summary, and the one place of the
 *  image: dropping or pasting on the picture sends it, and under the name come "Escolher imagem",
 *  the bin and the link button. An illustration, not the board: the real token appears only
 *  through the confirmed event.
 *
 *  Example: `<TokenPreview form={form} image={{ campaignId, assets }} onImage={setImage} distance={scene} />` */
export function TokenPreview(props: TokenPreviewProps): React.JSX.Element {
  const { form, image, onImage } = props;
  const sender = useImageSender({
    campaignId: image.campaignId,
    purpose: 'token',
    assets: image.assets,
    onSent: (asset) => onImage(asset.id),
  });
  const name = form.name.trim();
  return (
    <section
      aria-label="Prévia do token"
      aria-busy={sender.busy}
      className="flex flex-row items-start gap-4 md:h-full md:flex-col md:items-stretch"
    >
      <PreviewStage form={form} sender={sender} distance={props.distance} />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-col gap-1 md:text-center">
          <span
            className={cn(
              'font-display text-[22px] leading-tight font-semibold',
              name ? 'text-foreground' : 'text-placeholder',
            )}
          >
            {name || 'Sem nome'}
          </span>
          <span className="text-xs text-muted-foreground">{previewMetaOf(form)}</span>
        </div>
        <div className="flex flex-col gap-2 md:mt-auto">
          <ImageSourceButtons
            sender={sender}
            hasImage={form.imageAssetId !== null}
            onRemove={() => onImage(null)}
          />
          <p className="hidden text-[11px] leading-relaxed text-placeholder md:block md:text-center">
            Arraste pro quadro ou cole com Ctrl+V · PNG, JPEG ou WebP até 20 MB
          </p>
        </div>
      </div>
    </section>
  );
}

type PreviewStageProps = Readonly<{
  form: TokenFormValues;
  sender: ImageSender;
  distance: SceneDistance;
}>;

// The picture takes a dropped or pasted image ("Solta aqui" while a file is over it).
function PreviewStage({ form, sender, distance }: PreviewStageProps): React.JSX.Element {
  const [over, setOver] = useState(false);
  return (
    <div
      role="group"
      aria-label="Imagem do token"
      tabIndex={0}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        sender.sendFile(imageOfClipboard(event.dataTransfer));
      }}
      onPaste={(event) => sender.sendFile(imageOfClipboard(event.clipboardData))}
      className={cn(
        'relative aspect-square w-28 shrink-0 overflow-hidden rounded-lg border bg-panel outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring md:w-full',
        over ? 'border-primary' : 'border-divider',
      )}
      style={GRID_STYLE}
    >
      <LightGlow form={form} distance={distance} />
      <PreviewDisc form={form} />
      {over && (
        <span className="absolute inset-0 grid place-items-center bg-panel/80 text-sm font-semibold text-primary">
          Solta aqui
        </span>
      )}
    </div>
  );
}

// The faint gold grid of the board, the same illustration as the campaign covers.
const GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(rgb(197 164 109 / 0.08) 1px, transparent 1px), linear-gradient(90deg, rgb(197 164 109 / 0.08) 1px, transparent 1px)',
  backgroundSize: `${CELL_PX}px ${CELL_PX}px`,
};

// The light itself (an illustration of the domain, not decoration): as wide as the dim reaches.
function LightGlow({
  form,
  distance,
}: Readonly<{ form: TokenFormValues; distance: SceneDistance }>) {
  const parsed = parseRangeFields(form.light, distance, { missingBright: '' });
  if (!form.light.on || !parsed.ok || !parsed.range) return null;
  const reach = parsed.range.bright + parsed.range.dim;
  const size = Math.min(MAX_GLOW_PX, reach * 2 * CELL_PX + discPx(form.width));
  return (
    <span
      data-light-glow
      aria-hidden="true"
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        width: size,
        height: size,
        background:
          'radial-gradient(circle, rgb(226 199 147 / 0.22) 0%, rgb(226 199 147 / 0.08) 55%, rgb(226 199 147 / 0) 70%)',
      }}
    />
  );
}

function PreviewDisc({ form }: Readonly<{ form: TokenFormValues }>): React.JSX.Element {
  const width = discPx(form.width);
  const height = discPx(form.height);
  const firstBar = form.bars[0];
  const sample = firstBar ? barSampleOf(firstBar) : null;
  return (
    <span
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ width, height }}
    >
      <span
        className="absolute inset-[7%] overflow-hidden rounded-full bg-muted text-foreground"
        style={{
          boxShadow: `0 0 0 3px ${sideRingVar(form.side)}`,
          fontSize: Math.max(14, Math.min(44, Math.min(width, height) * 0.26)),
        }}
      >
        <TokenFace
          initials={form.initials || '?'}
          imageAssetId={form.imageAssetId}
          round
          alt="Imagem escolhida"
          className="size-full tracking-[0.04em]"
        />
      </span>
      {firstBar && sample && (
        <BarTrack
          fill={barFill(sample)}
          color={firstBar.color}
          className="absolute inset-x-[14%] top-[calc(100%+4px)]"
        />
      )}
    </span>
  );
}

function discPx(cells: number): number {
  return Math.min(MAX_DISC_PX, cells * CELL_PX);
}
