import { ASSET_FRAME, type FramedAssetPurposeDto } from '@lorkarium/contracts';
import { lazy, Suspense, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import type { ImageCropRect } from '@/services/assets-api';
import type { CropAreaProps } from './crop-area';
import {
  CROP_ZOOM_MAX,
  CROP_ZOOM_MIN,
  CROP_ZOOM_STEP,
  cropZoomText,
  steppedCropZoom,
} from './crop-zoom';

export type { CropAreaProps } from './crop-area';
export type CropAreaComponent = React.ComponentType<CropAreaProps>;

const LazyCropArea = lazy(() => import('./crop-area'));

const CROP_TITLE: Readonly<Record<FramedAssetPurposeDto, string>> = {
  campaign_photo: 'Recortar a foto da mesa',
  cover: 'Recortar a capa da mesa',
  campaign_banner: 'Recortar o banner da mesa',
};

// `=` is the `+` key without Shift on most layouts.
const ZOOM_KEYS: Readonly<Partial<Record<string, 'in' | 'out'>>> = {
  '+': 'in',
  '=': 'in',
  '-': 'out',
};

export type ImageCropDialogProps = Readonly<{
  file: Blob;
  purpose: FramedAssetPurposeDto;
  onConfirm: (crop: ImageCropRect) => void;
  onCancel: () => void;
  /** The drag-and-zoom area; the lazy `react-easy-crop` one by default (a spec passes a fake). */
  CropArea?: CropAreaComponent;
}>;

/** Frames a chosen image in the purpose's fixed aspect before it is sent: drag, zoom by the slider
 *  or `+`/`-`, then "Enviar" hands the rectangle in percent; "Cancelar" and Esc send nothing.
 *
 *  Example: `<ImageCropDialog file={file} purpose="cover" onConfirm={send} onCancel={drop} />` */
export function ImageCropDialog(props: ImageCropDialogProps): React.JSX.Element {
  const { purpose, onConfirm, onCancel } = props;
  const Area = props.CropArea ?? LazyCropArea;
  const [zoom, setZoom] = useState(CROP_ZOOM_MIN);
  const [area, setArea] = useState<ImageCropRect | null>(null);
  const frame = ASSET_FRAME[purpose];
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-xl" onKeyDown={(event) => zoomByKey(event, setZoom)}>
        <DialogHeader>
          <DialogTitle>{CROP_TITLE[purpose]}</DialogTitle>
          <DialogDescription>
            Arraste a imagem e ajuste o zoom. A proporção fica em {frame.width}:{frame.height}.
          </DialogDescription>
        </DialogHeader>
        <Suspense fallback={<CropAreaLoading />}>
          <Area
            image={props.file}
            aspect={frame.width / frame.height}
            zoom={zoom}
            onZoomChange={setZoom}
            onAreaChange={setArea}
          />
        </Suspense>
        <CropZoomField zoom={zoom} onZoomChange={setZoom} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" disabled={area === null} onClick={() => area && onConfirm(area)}>
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function zoomByKey(
  event: React.KeyboardEvent,
  setZoom: (change: (zoom: number) => number) => void,
) {
  const direction = ZOOM_KEYS[event.key];
  if (!direction) return;
  event.preventDefault();
  setZoom((zoom) => steppedCropZoom(zoom, direction));
}

function CropAreaLoading(): React.JSX.Element {
  return (
    <p role="status" className="flex h-72 items-center justify-center text-muted-foreground">
      Carregando o recorte…
    </p>
  );
}

type CropZoomFieldProps = Readonly<{ zoom: number; onZoomChange: (zoom: number) => void }>;

function CropZoomField({ zoom, onZoomChange }: CropZoomFieldProps): React.JSX.Element {
  const labelId = useId();
  return (
    <div className="flex items-center gap-3">
      <span id={labelId} className="text-[13px] font-medium text-label">
        Zoom
      </span>
      <Slider
        aria-labelledby={labelId}
        aria-valuetext={cropZoomText(zoom)}
        min={CROP_ZOOM_MIN}
        max={CROP_ZOOM_MAX}
        step={CROP_ZOOM_STEP}
        value={[zoom]}
        onValueChange={([next]) => next !== undefined && onZoomChange(next)}
      />
      <span className="w-10 text-right text-[13px] text-muted-foreground">
        {cropZoomText(zoom)}
      </span>
    </div>
  );
}
