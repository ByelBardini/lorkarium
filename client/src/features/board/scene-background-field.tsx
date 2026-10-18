import type { AssetDto, SceneBackgroundDto } from '@lorkarium/contracts';
import { useId } from 'react';
import { ImagePicker } from '@/components/image-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { AssetsApi } from '@/services/assets-api';

export type SceneBackgroundFieldProps = Readonly<{
  campaignId: string;
  assets: AssetsApi;
  background: SceneBackgroundDto | null;
  /** "Manter proporção da imagem": the cells follow the image; off, the image stretches. */
  locked: boolean;
  onBackground: (asset: AssetDto | null) => void;
  onLocked: (locked: boolean) => void;
}>;

/** The background image of the scene and the lock that ties the cells to its proportion.
 *
 *  Example: `<SceneBackgroundField campaignId={id} assets={assets} background={bg} locked={locked} onBackground={choose} onLocked={setLocked} />` */
export function SceneBackgroundField(props: SceneBackgroundFieldProps): React.JSX.Element {
  const { campaignId, assets, background, locked, onBackground, onLocked } = props;
  const lockId = useId();
  return (
    <div className="flex flex-col gap-3">
      <ImagePicker
        campaignId={campaignId}
        purpose="background"
        assets={assets}
        value={background?.assetId ?? null}
        onChange={onBackground}
        label="Imagem de fundo"
        removeLabel="Remover fundo"
      />
      {background && (
        <div className="flex items-center gap-3">
          <Checkbox
            id={lockId}
            checked={locked}
            onCheckedChange={(checked) => onLocked(checked === true)}
          />
          <Label htmlFor={lockId} className="text-sm text-label">
            Manter proporção da imagem
          </Label>
        </div>
      )}
    </div>
  );
}
