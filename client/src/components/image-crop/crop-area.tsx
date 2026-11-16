import { useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import { useImageDataUrl } from '@/lib/use-image-data-url';
import type { ImageCropRect } from '@/services/assets-api';
import { CROP_ZOOM_MAX, CROP_ZOOM_MIN } from './crop-zoom';

export type CropAreaProps = Readonly<{
  /** The chosen file, shown upright (the browser applies the EXIF orientation). */
  image: Blob;
  /** `width / height` of the frame: 1, 2 or 3. */
  aspect: number;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  /** The framed rectangle in percent (0..100) of the image, once the person stops moving it. */
  onAreaChange: (area: ImageCropRect) => void;
}>;

/** Where the person drags and zooms the image under a frame of fixed aspect; the only place of
 *  `react-easy-crop`. Load it with `lazy`.
 *
 *  Example: `const CropArea = lazy(() => import('@/components/image-crop/crop-area'))` */
export default function CropArea(props: CropAreaProps): React.JSX.Element {
  const imageUrl = useImageDataUrl(props.image);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  return (
    <div className="relative h-72 w-full overflow-hidden rounded-md bg-black">
      {imageUrl && (
        <Cropper
          image={imageUrl}
          aspect={props.aspect}
          crop={position}
          zoom={props.zoom}
          minZoom={CROP_ZOOM_MIN}
          maxZoom={CROP_ZOOM_MAX}
          onCropChange={setPosition}
          onZoomChange={props.onZoomChange}
          onCropComplete={(area: Area) => props.onAreaChange(rectOf(area))}
          mediaProps={{ alt: 'Imagem a recortar' }}
        />
      )}
    </div>
  );
}

function rectOf(area: Area): ImageCropRect {
  return { x: area.x, y: area.y, width: area.width, height: area.height };
}
