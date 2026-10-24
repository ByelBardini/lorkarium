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

export type AvatarUpload = Readonly<{
  sending: boolean;
  failure: ProfileFailure | null;
  send: (file: File) => void;
}>;

// The file goes straight to the service, like the table images (`useImageSender`): a `File` does
// not travel through a JSON submit, and the photo is saved apart from the profile bar anyway.
/** Sends a chosen or dropped photo: checked here first (type and 5 MB), then `PUT` to the server;
 *  once kept, the rail takes it and the account reloads.
 *
 *  Example: `const upload = useAvatarUpload(profileApi, sessionStore); upload.send(file)` */
export function useAvatarUpload(
  profileApi: ProfileApi,
  sessionStore: StoreApi<SessionStore>,
): AvatarUpload {
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<ProfileFailure | null>(null);
  const settle = useUploadOutcome(sessionStore, setFailure);
  const send = async (file: File): Promise<void> => {
    const problem = avatarFileProblem(file);
    setFailure(problem ? { kind: problem } : null);
    if (problem) return;
    setSending(true);
    const result = await profileApi.uploadAvatar(file);
    setSending(false);
    await settle(result);
  };
  return { sending, failure, send: (file) => void send(file) };
}

function useUploadOutcome(
  sessionStore: StoreApi<SessionStore>,
  refuse: (failure: ProfileFailure) => void,
): (result: AccountResult<ProfileDto, ProfileFailure>) => Promise<void> {
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
