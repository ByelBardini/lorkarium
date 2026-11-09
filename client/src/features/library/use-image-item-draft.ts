import type { AssetDto, SceneVisibilityDto } from '@lorkarium/contracts';
import { useState } from 'react';

type DraftOptions = Readonly<{
  folderId: string | null;
  live: boolean;
  onSavingChange?: (saving: boolean) => void;
}>;

/** What the form validates with its DTO before sending. */
export type ImageItemRequest = Readonly<{
  name: string;
  assetId: string | undefined;
  folderId: string | null;
  visibility: SceneVisibilityDto;
}>;

export type ImageItemDraft = Readonly<{
  name: string;
  setName: (name: string) => void;
  saving: boolean;
  failure: string | null;
  /** Saving, or the table is not live: the fields are locked. */
  locked: boolean;
  /** Nothing uploading nor saving, with the table live. */
  canSend: boolean;
  request: ImageItemRequest;
  setAsset: (asset: AssetDto | null) => void;
  setUploading: (uploading: boolean) => void;
  setVisibility: (visibility: SceneVisibilityDto) => void;
  /** Runs `send`, whose answer is the refusal to show (`null` = saved). */
  save: (send: () => Promise<string | null>) => Promise<void>;
}>;

/** The state of a new library item born from an uploaded image. It outlives a refused
 *  registration, so trying again keeps the name and sends no second file.
 *
 *  Example: `const draft = useImageItemDraft({ folderId, live }); await draft.save(register)` */
export function useImageItemDraft(options: DraftOptions): ImageItemDraft {
  const [name, setName] = useState('');
  const [asset, setAsset] = useState<AssetDto | null>(null);
  const [visibility, setVisibility] = useState<SceneVisibilityDto>('private');
  const [uploading, setUploading] = useState(false);
  const { saving, failure, run } = useRegistrationRun(options.onSavingChange);
  const locked = saving || !options.live;
  const canSend = options.live && !uploading && !saving;
  return {
    name,
    setName,
    saving,
    failure,
    locked,
    canSend,
    save: (send) => (canSend ? run(send) : Promise.resolve()),
    request: { name, assetId: asset?.id, folderId: options.folderId, visibility },
    setAsset,
    setUploading,
    setVisibility,
  };
}

type RegistrationRun = Readonly<{
  saving: boolean;
  failure: string | null;
  run: (send: () => Promise<string | null>) => Promise<void>;
}>;

function useRegistrationRun(onSavingChange?: (saving: boolean) => void): RegistrationRun {
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const markSaving = (nowSaving: boolean): void => {
    setSaving(nowSaving);
    onSavingChange?.(nowSaving);
  };
  const run = async (send: () => Promise<string | null>): Promise<void> => {
    markSaving(true);
    setFailure(null);
    const refusal = await send();
    markSaving(false);
    setFailure(refusal);
  };
  return { saving, failure, run };
}
