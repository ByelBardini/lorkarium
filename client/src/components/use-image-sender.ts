import type { AssetDto, AssetPurposeDto, FramedAssetPurposeDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { animatesImage, imageAcceptOf, imageFileProblem, isFramedPurpose } from '@/lib/image-file';
import type { AssetsApi, AssetsResult, ImageCropRect } from '@/services/assets-api';
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

/** A checked file waiting to be framed, for a purpose the server keeps in a fixed aspect. */
export type ImageCropping = Readonly<{ file: File; purpose: FramedAssetPurposeDto }>;

/** The sender plus the crop step: with `cropping` set, the place shows the crop dialog and answers
 *  with `confirmCrop` (uploads the file with the rectangle) or `cancelCrop` (sends nothing). */
export type CroppingImageSender = ImageSender &
  Readonly<{
    cropping: ImageCropping | null;
    confirmCrop: (crop: ImageCropRect) => void;
    cancelCrop: () => void;
  }>;

/** Sends an image to the campaign's assets: a file is checked before (type and size), a second
 *  one while sending is ignored, and the refusal is told in words. A file for a framed purpose
 *  (photo, cover, banner) waits in `cropping` until the crop is confirmed; a link never does.
 *
 *  Example: `const sender = useImageSender({ campaignId, purpose: 'token', assets, onSent: choose })` */
export function useImageSender(options: ImageSenderOptions): CroppingImageSender {
  const { campaignId, purpose, assets } = options;
  const { busy, problem, setProblem, send } = useAssetRequest(options.onSent);
  const [cropping, setCropping] = useState<ImageCropping | null>(null);
  const animated = animatesImage(purpose);
  const sendFile = (file: File | null | undefined): void => {
    if (!file || busy) return;
    const local = imageFileProblem(file, { animated });
    if (local) return setProblem(local);
    if (isFramedPurpose(purpose)) return setCropping({ file, purpose });
    void send(() => assets.upload(campaignId, file, purpose));
  };
  const confirmCrop = (crop: ImageCropRect): void => {
    if (!cropping) return;
    setCropping(null);
    void send(() => assets.upload(campaignId, cropping.file, cropping.purpose, crop));
  };
  const sendLink = async (url: string): Promise<boolean> => {
    const link = url.trim();
    if (busy || link === '') return false;
    return send(() => assets.importLink(campaignId, link, purpose));
  };
  const cancelCrop = (): void => setCropping(null);
  const accept = imageAcceptOf({ animated });
  return { accept, busy, problem, sendFile, sendLink, cropping, confirmCrop, cancelCrop };
}

type AssetRequest = Readonly<{
  busy: boolean;
  problem: string | null;
  setProblem: (problem: string | null) => void;
  send: (request: () => Promise<AssetsResult>) => Promise<boolean>;
}>;

function useAssetRequest(onSent: (asset: AssetDto) => void): AssetRequest {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const send = async (request: () => Promise<AssetsResult>): Promise<boolean> => {
    setBusy(true);
    setProblem(null);
    const result = await request();
    setBusy(false);
    if (!result.ok) setProblem(imageFailureMessage(result.failure));
    else onSent(result.asset);
    return result.ok;
  };
  return { busy, problem, setProblem, send };
}
