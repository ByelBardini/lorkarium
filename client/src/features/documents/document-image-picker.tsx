import { useMemo, useState } from 'react';
import type { AssetDto, LibraryImageDto } from '@lorkarium/contracts';
import { ImagePicker } from '@/components/image-picker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { AssetsApi, AssetsResult } from '@/services/assets-api';
import type { DocumentsApi, DocumentsResult } from '@/services/documents-api';
import { documentFailureMessage } from './document-messages';

type DocumentImagePickerProps = Readonly<{
  api: DocumentsApi;
  campaignId: string;
  documentId: string;
  images: readonly LibraryImageDto[];
  onChoose: (asset: AssetDto | null) => void;
}>;

/** Reuses the existing sender against document-scoped routes. Example: `new DocumentImageAssets(api, campaignId, documentId)`. */
class DocumentImageAssets implements AssetsApi {
  constructor(
    private readonly api: DocumentsApi,
    private readonly campaignId: string,
    private readonly documentId: string,
  ) {}
  async upload(_campaignId: string, file: Blob): Promise<AssetsResult> {
    return imageAnswer(await this.api.uploadImage(this.campaignId, this.documentId, file));
  }
  async importLink(_campaignId: string, url: string): Promise<AssetsResult> {
    return imageAnswer(await this.api.importImage(this.campaignId, this.documentId, url));
  }
}

/** Computer, imported URL, or authorized library image. Example: `<DocumentImagePicker {...props} />`. */
export function DocumentImagePicker(props: DocumentImagePickerProps): React.JSX.Element {
  const assets = useMemo(
    () => new DocumentImageAssets(props.api, props.campaignId, props.documentId),
    [props.api, props.campaignId, props.documentId],
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const choose = async (imageId: string): Promise<void> => {
    setBusy(true);
    setProblem(null);
    const result = await props.api.libraryImage(props.campaignId, props.documentId, imageId);
    setBusy(false);
    if (result.ok) props.onChoose(result.value);
    else setProblem(documentFailureMessage(result.failure));
  };
  return (
    <Dialog open onOpenChange={(open) => !open && props.onChoose(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inserir imagem no documento</DialogTitle>
          <DialogDescription>A imagem será guardada com o documento.</DialogDescription>
        </DialogHeader>
        <ImagePicker
          campaignId={props.campaignId}
          purpose="document_image"
          assets={assets}
          value={null}
          onChange={props.onChoose}
          label="Imagem do documento"
          disabled={busy}
          onBusyChange={setBusy}
        />
        <label className="flex flex-col gap-2 text-sm">
          Imagem da biblioteca
          <select
            aria-label="Imagem da biblioteca"
            value=""
            disabled={busy}
            onChange={(event) => void choose(event.target.value)}
            className="rounded-md border border-input bg-card p-2"
          >
            <option value="">Escolher na biblioteca…</option>
            {props.images.map((image) => (
              <option key={image.id} value={image.id}>
                {image.name}
              </option>
            ))}
          </select>
        </label>
        {problem && <p role="alert">{problem}</p>}
        <Button variant="outline" onClick={() => props.onChoose(null)}>
          Cancelar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
function imageAnswer(result: DocumentsResult<AssetDto>): AssetsResult {
  if (result.ok) return { ok: true, asset: result.value };
  const kind = result.failure.kind;
  if (
    kind === 'offline' ||
    kind === 'unauthenticated' ||
    kind === 'not_found' ||
    kind === 'invalid'
  )
    return { ok: false, failure: { kind } };
  return { ok: false, failure: { kind: 'unexpected' } };
}
