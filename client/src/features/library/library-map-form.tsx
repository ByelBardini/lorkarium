import {
  MAP_NAME_MAX_LENGTH,
  createLibraryMapRequestDto,
  type LibraryMapSummaryDto,
} from '@lorkarium/contracts';
import type { AssetsApi } from '@/services/assets-api';
import type { LibraryMapsApi } from '@/services/library-maps-api';
import { ImageItemForm } from './image-item-form';
import { libraryMapRefusalMessage } from './library-messages';

export type LibraryMapFormProps = Readonly<{
  campaignId: string;
  folderId: string | null;
  assets: AssetsApi;
  api: LibraryMapsApi;
  live: boolean;
  onSaved: (map: LibraryMapSummaryDto) => void;
  onClose: () => void;
  /** The dialog around it cannot close nor change type while the map is being saved. */
  onSavingChange?: (saving: boolean) => void;
}>;

/** A new map: name, its own image and who sees it.
 *
 *  Example: `<LibraryMapForm campaignId={id} folderId={null} assets={assets} api={mapsApi} live onSaved={pick} onClose={close} />` */
export function LibraryMapForm(props: LibraryMapFormProps): React.JSX.Element {
  return (
    <ImageItemForm
      {...props}
      nameMaxLength={MAP_NAME_MAX_LENGTH}
      purpose="library_map"
      imageLabel="Imagem do mapa"
      visibilityLabels={{ private: 'Privado', public: 'Público' }}
      bodyOf={(request) => createLibraryMapRequestDto.safeParse(request).data ?? null}
      register={async (body) => {
        const answer = await props.api.create(props.campaignId, body);
        if (!answer.ok) return libraryMapRefusalMessage(answer.failure);
        props.onSaved(answer.value);
        return null;
      }}
    />
  );
}
