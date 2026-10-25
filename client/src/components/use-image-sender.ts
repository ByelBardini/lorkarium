import type { AssetDto, AssetPurposeDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { animatesImage, imageAcceptOf, imageFileProblem } from '@/lib/image-file';
import type { AssetsApi, AssetsResult } from '@/services/assets-api';
import { imageFailureMessage } from './image-picker-messages';

export type ImageSenderOptions = Readonly<{
  campaignId: string;
  purpose: AssetPurposeDto;
  assets: AssetsApi;
  /** The asset the server kept. */
  onSent: (asset: AssetDto) => void;
}>;

/** What a place that takes an image needs: whether one is sending, why the last one failed, and
 *  how to send a file (chosen, dropped or pasted) or a link. `sendLink` answers whether it was kept,
 *  so the link field closes only then. */
export type ImageSender = Readonly<{
  /** The `accept` of the file input for this purpose (GIF only for the aura). */
  accept: string;
  busy: boolean;
  problem: string | null;
  sendFile: (file: File | null | undefined) => void;
  sendLink: (url: string) => Promise<boolean>;
}>;

/** Sends an image to the campaign's assets: a file is checked before (type and size), a second
 *  one while sending is ignored, and the refusal is told in words.
 *
 *  Example: `const sender = useImageSender({ campaignId, purpose: 'token', assets, onSent: choose })` */
export function useImageSender(options: ImageSenderOptions): ImageSender {
  const { campaignId, purpose, assets, onSent } = options;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const animated = animatesImage(purpose);
  const send = async (request: () => Promise<AssetsResult>): Promise<boolean> => {
    setBusy(true);
    setProblem(null);
    const result = await request();
    setBusy(false);
    if (!result.ok) setProblem(imageFailureMessage(result.failure));
    else onSent(result.asset);
    return result.ok;
  };
  const sendFile = (file: File | null | undefined): void => {
    if (!file || busy) return;
    const local = imageFileProblem(file, { animated });
    if (local) return setProblem(local);
    void send(() => assets.upload(campaignId, file, purpose));
  };
  const sendLink = async (url: string): Promise<boolean> => {
    const link = url.trim();
    if (busy || link === '') return false;
    return send(() => assets.importLink(campaignId, link, purpose));
  };
  return { accept: imageAcceptOf({ animated }), busy, problem, sendFile, sendLink };
}
