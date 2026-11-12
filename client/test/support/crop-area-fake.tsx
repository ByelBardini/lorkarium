import type { CropAreaProps } from '@/components/image-crop/image-crop-dialog';
import type { ImageCropRect } from '@/services/assets-api';

/** The crop area as the spec plays it (jsdom loads no image, so `react-easy-crop` never measures):
 *  it shows the `aspect` and `zoom` it received as `data-*` and the button "Recorte de teste"
 *  reports `area` as if the person had stopped dragging.
 *
 *  Example: `<ImageCropDialog CropArea={fakeCropAreaReporting({ x: 10, y: 0, width: 80, height: 100 })} … />` */
export function fakeCropAreaReporting(
  area: ImageCropRect,
): (props: CropAreaProps) => React.JSX.Element {
  return function FakeCropArea(props: CropAreaProps): React.JSX.Element {
    return (
      <div aria-label="Área de recorte" data-aspect={props.aspect} data-zoom={props.zoom}>
        <button type="button" onClick={() => props.onAreaChange(area)}>
          Recorte de teste
        </button>
      </div>
    );
  };
}

export const CENTER_STRIP: ImageCropRect = { x: 10, y: 0, width: 80, height: 100 };
