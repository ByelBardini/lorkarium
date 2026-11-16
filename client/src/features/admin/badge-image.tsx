import { BADGE_IMAGE_MAX_BYTES } from '@lorkarium/contracts';
import { useRef, useState } from 'react';
import { useRevalidator } from 'react-router';
import { ImageCropDialog, type CropAreaComponent } from '@/components/image-crop/image-crop-dialog';
import { imageAcceptOf, imageFileProblem } from '@/lib/image-file';
import type { ImageCropRect } from '@/services/assets-api';
import type { BadgesAdminApi } from '@/services/badges-admin-api';
import { badgeFailureMessage } from './admin-messages';

export const BADGE_IMAGE_SIZE_PROBLEM = 'A imagem passa de 2 MB.';

// The server takes a GIF too and keeps its first frame (badges are static).
const BADGE_IMAGE_ACCEPT = imageAcceptOf({ animated: true });

/** Why a chosen file cannot be a badge image (before any request), or `null` when it can.
 *
 *  Example: `badgeImageProblem(bigPng) // 'A imagem passa de 2 MB.'` */
export function badgeImageProblem(file: Pick<Blob, 'type' | 'size'>): string | null {
  const typeProblem = imageFileProblem({ type: file.type, size: 0 }, { animated: true });
  if (typeProblem) return typeProblem;
  return file.size > BADGE_IMAGE_MAX_BYTES ? BADGE_IMAGE_SIZE_PROBLEM : null;
}

export type BadgeImagePick = Readonly<{
  /** The hidden file input and, once a file passes, the 1:1 crop dialog. */
  element: React.ReactNode;
  /** Opens the file chooser. */
  open: () => void;
  /** Why the last chosen file was refused here, or `null`. */
  problem: string | null;
}>;

/** Choosing a badge image: the file is checked (type, 2 MB), framed in 1:1 ("Recortar a
 *  insígnia"), then handed to `onFramed` with the rectangle; "Cancelar" hands nothing.
 *
 *  Example: `const pick = useBadgeImagePick((file, crop) => setChosen({ file, crop })); pick.open()` */
export function useBadgeImagePick(
  onFramed: (file: File, crop: ImageCropRect) => void,
  cropArea?: CropAreaComponent,
): BadgeImagePick {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const choose = (chosen: File | undefined): void => {
    if (!chosen) return;
    const refused = badgeImageProblem(chosen);
    setProblem(refused);
    if (refused === null) setFile(chosen);
  };
  const element = (
    <>
      <input
        ref={input}
        type="file"
        accept={BADGE_IMAGE_ACCEPT}
        aria-label="Arquivo de imagem"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          choose(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {file && (
        <ImageCropDialog
          file={file}
          purpose="campaign_photo"
          title="Recortar a insígnia"
          CropArea={cropArea}
          onConfirm={(crop) => {
            setFile(null);
            onFramed(file, crop);
          }}
          onCancel={() => setFile(null)}
        />
      )}
    </>
  );
  return { element, open: () => input.current?.click(), problem };
}

export type BadgeImageSend = Readonly<{
  sending: boolean;
  /** Uploads and reloads the catalog; answers the refusal in words, or `null` when kept. */
  send: (badgeId: string, file: Blob, crop: ImageCropRect) => Promise<string | null>;
}>;

/** Sends a framed image to a badge, straight to the service (a `File` does not travel in JSON).
 *  The catalog reloads either way: a fallen session or a lost role is then refused by the loader,
 *  which leaves for the login or "Sem acesso".
 *
 *  Example: `const problem = await image.send(badge.id, file, crop)` */
export function useBadgeImageSend(api: BadgesAdminApi): BadgeImageSend {
  const revalidator = useRevalidator();
  const [sending, setSending] = useState(false);
  const send = async (badgeId: string, file: Blob, crop: ImageCropRect): Promise<string | null> => {
    setSending(true);
    const result = await api.uploadImage(badgeId, file, crop);
    await revalidator.revalidate();
    setSending(false);
    return result.ok ? null : badgeFailureMessage(result.failure);
  };
  return { sending, send };
}
