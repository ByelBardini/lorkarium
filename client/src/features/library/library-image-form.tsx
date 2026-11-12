import {
  LIBRARY_IMAGE_NAME_MAX_LENGTH,
  createLibraryImageRequestDto,
  type LibraryImageDto,
} from '@lorkarium/contracts';
import type { AssetsApi } from '@/services/assets-api';
import type { LibraryApi } from '@/services/library-api';
import { ImageItemForm } from './image-item-form';
import { libraryFailureMessage } from './library-messages';

export type LibraryImageFormProps = Readonly<{
  campaignId: string;
  folderId: string | null;
  assets: AssetsApi;
  api: LibraryApi;
  live: boolean;
  onSaved: (image: LibraryImageDto) => void;
  onClose: () => void;
  /** The dialog around it cannot close nor change type while the image is being saved. */
  onSavingChange?: (saving: boolean) => void;
}>;

/** Retains an uploaded asset when registration fails. Example: `<LibraryImageForm {...props} />`. */
export function LibraryImageForm(props: LibraryImageFormProps): React.JSX.Element {
  return (
    <ImageItemForm
      {...props}
      nameMaxLength={LIBRARY_IMAGE_NAME_MAX_LENGTH}
      purpose="library_image"
      imageLabel="Imagem"
      visibilityLabels={{ private: 'Privada', public: 'Pública' }}
      bodyOf={(request) => createLibraryImageRequestDto.safeParse(request).data ?? null}
      register={async (body) => {
        const answer = await props.api.createImage(props.campaignId, body);
        if (!answer.ok) return libraryFailureMessage(answer.failure);
        props.onSaved(answer.value);
        return null;
      }}
    />
  );
}
