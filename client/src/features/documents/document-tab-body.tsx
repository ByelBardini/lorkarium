import { lazy, Suspense, useState } from 'react';
import type { AssetDto } from '@lorkarium/contracts';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import { assetUrlOf } from '@/services/assets-api';
import type { Clipboard } from '@/services/clipboard';
import type { DocumentsApi } from '@/services/documents-api';
import type { MixedLibrary } from '@/lib/library-entries';
import type { DocumentTabEditorState } from '@/stores/document-editor-store';
import { DocumentImagePicker } from './document-image-picker';
import { documentFailureMessage } from './document-messages';
import { DraftProblemActions } from './draft-problem-actions';

const RichDocumentEditor = lazy(() => import('@/rich-text-editor/document-editor'));
type ImageReference = Readonly<{ assetId: string; alt?: string }>;
export type DocumentTabBodyProps = Readonly<{
  editor: StoreApi<DocumentTabEditorState>;
  api: DocumentsApi;
  campaignId: string;
  documentId: string;
  /** The tab shown: its images are prepared in it. */
  tabId: string;
  library: MixedLibrary;
  clipboard: Clipboard;
  /** The document may be edited right now (rights, connection, the name's own state). */
  canEdit: boolean;
  onConfirmReload: (discard: () => Promise<void>) => void;
}>;
const READ_ONLY_STATUSES = ['conflict', 'forbidden', 'not_found', 'loading'];

/** One tab's body: its own draft, saved against the tab's version, with the image pickers.
 *
 *  Example: `<DocumentTabBody key={tabKey} editor={tabEditor} canEdit {...context} />` */
export function DocumentTabBody(props: DocumentTabBodyProps): React.JSX.Element {
  const state = useStore(props.editor);
  const [imageAnswer, setImageAnswer] = useState<((image: AssetDto | null) => void) | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { api, campaignId, documentId, tabId } = props;
  const imageOf = async (
    request: Promise<Awaited<ReturnType<DocumentsApi['uploadImage']>>>,
    alt?: string,
  ): Promise<ImageReference> => {
    const result = await request;
    if (result.ok)
      return alt === undefined ? { assetId: result.value.id } : { assetId: result.value.id, alt };
    const message = documentFailureMessage(result.failure);
    setProblem(message);
    throw new Error(message);
  };
  const insertImage = (): Promise<ImageReference | null> =>
    new Promise((resolve) =>
      setImageAnswer(
        () => (asset: AssetDto | null) => resolve(asset ? { assetId: asset.id } : null),
      ),
    );
  if (!state.confirmed || !state.draft) return <p className="p-6 text-sm">Carregando aba…</p>;
  const editable = props.canEdit && !READ_ONLY_STATUSES.includes(state.status);
  return (
    <>
      <DraftProblemActions
        status={state.status}
        dirty={state.dirty}
        draft={state.draft.content}
        clipboard={props.clipboard}
        onDiscard={() => state.discard()}
        onConfirmReload={props.onConfirmReload}
        onRetry={() => void state.flush()}
      />
      <Suspense
        fallback={
          <p role="status" className="p-4">
            Carregando editor…
          </p>
        }
      >
        <RichDocumentEditor
          content={editable ? state.draft.content : state.confirmed.content}
          editable={editable}
          onChange={(content) => state.edit({ content })}
          assetUrl={assetUrlOf}
          onInsertImage={insertImage}
          onImageFiles={(files) =>
            Promise.all(
              files.map((file) =>
                imageOf(api.uploadImage(campaignId, documentId, tabId, file), file.name),
              ),
            )
          }
          onImportImage={(url) => imageOf(api.importImage(campaignId, documentId, tabId, url))}
        />
      </Suspense>
      {problem && (
        <p role="alert" className="p-4 text-destructive-text">
          {problem}
        </p>
      )}
      {imageAnswer && editable && (
        <DocumentImagePicker
          api={api}
          campaignId={campaignId}
          documentId={documentId}
          tabId={tabId}
          images={props.library.images ?? []}
          onChoose={(asset) => {
            imageAnswer(asset);
            setImageAnswer(null);
          }}
        />
      )}
    </>
  );
}
