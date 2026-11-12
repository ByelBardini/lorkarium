import type { ProfileDto } from '@lorkarium/contracts';
import type { FormEvent } from 'react';
import {
  unsavedChangesStateOf,
  useSavedNotice,
  type UnsavedChangesState,
} from '@/lib/unsaved-changes';
import { accountFailureMessage } from './account-messages';
import { failureOf, useAccountFetcher, useOnSettled } from './use-account-fetcher';
import { useProfileDraft, type ProfileDraft } from './use-profile-draft';

export type ProfileSave = Readonly<{
  saving: boolean;
  barState: UnsavedChangesState | null;
  failureMessage: string | null;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}>;

/** The draft of the profile and its save, one for the whole page. */
export type ProfileEditor = Readonly<{ draft: ProfileDraft; save: ProfileSave }>;

/** The profile draft shared by the "Perfil" and "Dados" tabs: an edit in one survives the switch
 *  to the other, and either bar saves both in one PATCH.
 *
 *  Example: `const editor = useProfileEditor(profile); <ProfileForm editor={editor} label="Perfil">…</ProfileForm>` */
export function useProfileEditor(profile: ProfileDto): ProfileEditor {
  const draft = useProfileDraft(profile);
  return { draft, save: useProfileSave(draft) };
}

function useProfileSave(draft: ProfileDraft): ProfileSave {
  const fetcher = useAccountFetcher();
  const notice = useSavedNotice();
  const failure = failureOf(fetcher.settled);
  useOnSettled(fetcher.settled, (result) => {
    if (!('done' in result)) return;
    draft.discard();
    notice.showSaved();
  });
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (draft.update) fetcher.send({ intent: 'profile-update', input: draft.update });
  };
  return {
    saving: fetcher.busy,
    barState: unsavedChangesStateOf({
      saving: fetcher.busy,
      dirty: draft.dirty,
      justSaved: notice.justSaved,
    }),
    failureMessage: failure && draft.dirty ? accountFailureMessage(failure) : null,
    submit,
  };
}
