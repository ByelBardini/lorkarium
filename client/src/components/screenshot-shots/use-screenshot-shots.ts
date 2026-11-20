import { SCREENSHOT_MAX_BYTES, SCREENSHOT_MIME_TYPES, SCREENSHOTS_MAX } from '@lorkarium/contracts';
import { useEffect, useRef, useState } from 'react';

/** A screenshot picked for a report or a feedback: its thumbnail, its id once it went up, and why
 *  it did not. */
export type ScreenshotShot = Readonly<{
  key: number;
  file: File;
  /** An object URL of the file, let go when the shot is removed or the dialog closes. */
  previewUrl: string;
  attachmentId: string | null;
  error: string | null;
}>;

export type ScreenshotShots = Readonly<{
  shots: readonly ScreenshotShot[];
  /** Why the last pick refused a file (limit, type or size), shown once above the list. */
  refusal: string | null;
  add: (files: readonly File[]) => void;
  remove: (key: number) => void;
  /** Sends the ones not up yet, in order; `null` when one failed (its error is on it). */
  uploadAll: () => Promise<string[] | null>;
}>;

/** One upload as the field shows it: the kept id, or the sentence of its failure. */
export type ScreenshotUploadOutcome = Readonly<
  { ok: true; id: string } | { ok: false; error: string }
>;

export type ScreenshotShotsOptions = Readonly<{
  upload: (file: File) => Promise<ScreenshotUploadOutcome>;
  /** The sentence of the 6th pick ("Até 5 prints por denúncia."). */
  limitText: string;
}>;

const ACCEPTED_TYPES: readonly string[] = SCREENSHOT_MIME_TYPES;

/** Why `file` cannot join `keptCount` screenshots already picked, or `null` when it can; checked
 *  before anything goes up, with the server's own limits.
 *
 *  Example: `screenshotRefusalOf(gif, 0, 'Até 5 prints.') // 'Envie um PNG, JPEG ou WebP.'` */
export function screenshotRefusalOf(
  file: File,
  keptCount: number,
  limitText: string,
): string | null {
  if (keptCount >= SCREENSHOTS_MAX) return limitText;
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Envie um PNG, JPEG ou WebP.';
  if (file.size > SCREENSHOT_MAX_BYTES) return 'O print passa de 5 MB.';
  return null;
}

/** The screenshots of a dialog: picked, removed, and sent one by one before what cites them. One
 *  that went up keeps its id, so sending again only retries the ones that did not.
 *
 *  Example: `const shots = useScreenshotShots({ upload, limitText }); const ids = await shots.uploadAll()` */
export function useScreenshotShots(options: ScreenshotShotsOptions): ScreenshotShots {
  const [shots, setShots] = useState<readonly ScreenshotShot[]>([]);
  const [refusal, setRefusal] = useState<string | null>(null);
  const current = useRef<readonly ScreenshotShot[]>([]);
  const nextKey = useRef(1);
  const commit = (next: readonly ScreenshotShot[]): void => {
    current.current = next;
    setShots(next);
  };
  const patch: ShotPatch = (key, change) =>
    commit(current.current.map((shot) => (shot.key === key ? { ...shot, ...change } : shot)));
  const add = (files: readonly File[]): void => {
    const picked = pickedShots(files, current.current, options.limitText, () => nextKey.current++);
    setRefusal(picked.refusal);
    commit(picked.shots);
  };
  const remove = (key: number): void => {
    current.current.filter((shot) => shot.key === key).forEach(letGo);
    commit(current.current.filter((shot) => shot.key !== key));
  };
  useEffect(() => () => current.current.forEach(letGo), []);
  const uploadAll = (): Promise<string[] | null> =>
    uploadPending(options.upload, current.current, patch);
  return { shots, refusal, add, remove, uploadAll };
}

type ShotPatch = (key: number, change: Partial<ScreenshotShot>) => void;
type ShotUpload = ScreenshotShotsOptions['upload'];

const NOT_SENT = { attachmentId: null, error: null } as const;

function letGo(shot: ScreenshotShot): void {
  URL.revokeObjectURL(shot.previewUrl);
}

async function uploadPending(
  upload: ShotUpload,
  shots: readonly ScreenshotShot[],
  patch: ShotPatch,
): Promise<string[] | null> {
  const ids: string[] = [];
  for (const shot of shots) {
    const id = shot.attachmentId ?? (await uploadOne(upload, shot, patch));
    if (id === null) return null;
    ids.push(id);
  }
  return ids;
}

function pickedShots(
  files: readonly File[],
  kept: readonly ScreenshotShot[],
  limitText: string,
  keyOf: () => number,
): Readonly<{ shots: ScreenshotShot[]; refusal: string | null }> {
  const shots = [...kept];
  let refusal: string | null = null;
  for (const file of files) {
    const refused = screenshotRefusalOf(file, shots.length, limitText);
    if (refused !== null) refusal = refused;
    else shots.push({ key: keyOf(), file, previewUrl: URL.createObjectURL(file), ...NOT_SENT });
  }
  return { shots, refusal };
}

async function uploadOne(
  upload: ShotUpload,
  shot: ScreenshotShot,
  patch: ShotPatch,
): Promise<string | null> {
  const outcome = await upload(shot.file);
  if (!outcome.ok) {
    patch(shot.key, { error: outcome.error });
    return null;
  }
  patch(shot.key, { attachmentId: outcome.id, error: null });
  return outcome.id;
}
