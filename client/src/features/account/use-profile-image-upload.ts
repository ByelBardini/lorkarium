import type { ProfileDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { useLocation, useNavigate, useRevalidator } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { loginPathFor } from '@/app/route-access';
import { avatarFileProblem } from '@/lib/avatar-file';
import type { AccountResult } from '@/services/account-failure';
import type { ProfileApi, ProfileFailure } from '@/services/profile-api';
import type { SessionStore } from '@/stores/session-store';
import { applyProfileToSession } from './session-profile';

export type ProfileImageUpload = Readonly<{
  sending: boolean;
  failure: ProfileFailure | null;
  send: (file: File) => void;
  /** The image from a link; answers whether it was kept, so the link field closes only then. */
  sendLink: (url: string) => Promise<boolean>;
}>;

type ProfileOutcome = AccountResult<ProfileDto, ProfileFailure>;

/** Where one image of the profile goes: its file, its link, and the refusal of a file too big. */
type ProfileImageTarget = Readonly<{
  upload: (file: File) => Promise<ProfileOutcome>;
  fromLink: (url: string) => Promise<ProfileOutcome>;
  tooLarge: 'avatar_too_large' | 'dice_texture_too_large';
}>;

/** Sends a chosen or dropped photo: checked here first (type and 5 MB), then `PUT` to the server;
 *  once kept, the rail takes it and the account reloads.
 *
 *  Example: `const upload = useAvatarUpload(profileApi, sessionStore); upload.send(file)` */
export function useAvatarUpload(
  profileApi: ProfileApi,
  sessionStore: StoreApi<SessionStore>,
): ProfileImageUpload {
  return useProfileImageUpload(sessionStore, {
    upload: (file) => profileApi.uploadAvatar(file),
    fromLink: (url) => profileApi.avatarFromLink(url),
    tooLarge: 'avatar_too_large',
  });
}

/** Sends the dice texture (file or link) with the photo's checks (same types, same 5 MB); once
 *  kept, the account reloads and the preview shows it.
 *
 *  Example: `const upload = useDiceTextureUpload(profileApi, sessionStore); upload.send(file)` */
export function useDiceTextureUpload(
  profileApi: ProfileApi,
  sessionStore: StoreApi<SessionStore>,
): ProfileImageUpload {
  return useProfileImageUpload(sessionStore, {
    upload: (file) => profileApi.uploadDiceTexture(file),
    fromLink: (url) => profileApi.diceTextureFromLink(url),
    tooLarge: 'dice_texture_too_large',
  });
}

// The file goes straight to the service, like the table images (`useImageSender`): a `File` does
// not travel through a JSON submit, and the image is saved apart from the profile bar anyway.
function useProfileImageUpload(
  sessionStore: StoreApi<SessionStore>,
  target: ProfileImageTarget,
): ProfileImageUpload {
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<ProfileFailure | null>(null);
  const settle = useUploadOutcome(sessionStore, setFailure);
  const sendWith = async (request: () => Promise<ProfileOutcome>): Promise<boolean> => {
    setFailure(null);
    setSending(true);
    const result = await request();
    setSending(false);
    await settle(result);
    return result.ok;
  };
  const send = (file: File): void => {
    const problem = fileProblemOf(file, target.tooLarge);
    if (problem) return setFailure(problem);
    void sendWith(() => target.upload(file));
  };
  const sendLink = (url: string): Promise<boolean> => sendWith(() => target.fromLink(url.trim()));
  return { sending, failure, send, sendLink };
}

function fileProblemOf(
  file: File,
  tooLarge: ProfileImageTarget['tooLarge'],
): ProfileFailure | null {
  const problem = avatarFileProblem(file);
  if (problem === null) return null;
  return { kind: problem === 'avatar_too_large' ? tooLarge : problem };
}

function useUploadOutcome(
  sessionStore: StoreApi<SessionStore>,
  refuse: (failure: ProfileFailure) => void,
): (result: ProfileOutcome) => Promise<void> {
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const location = useLocation();
  return async (result) => {
    if (result.ok) {
      applyProfileToSession(sessionStore, result.value);
      return revalidator.revalidate();
    }
    if (result.failure.kind !== 'unauthenticated') return refuse(result.failure);
    sessionStore.getState().signedOut();
    const here = new URL(`${location.pathname}${location.search}`, 'http://lorkarium.local');
    await navigate(loginPathFor(here), { replace: true });
  };
}
