import { PROFILE_BIO_MAX_LENGTH, type ProfileDto } from '@lorkarium/contracts';
import { useEffect, useId, useState, type FormEvent } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ProfileApi } from '@/services/profile-api';
import type { SessionStore } from '@/stores/session-store';
import { accountFailureMessage } from './account-messages';
import { AvatarField } from './avatar-field';
import { LeaveWithoutSavingDialog } from './leave-without-saving-dialog';
import { ProfileColorField } from './profile-color-field';
import { ProfilePreview } from './profile-preview';
import { SectionHeading } from './section-heading';
import { UnsavedChangesBar, type UnsavedChangesState } from './unsaved-changes-bar';
import { failureOf, useAccountFetcher, useOnSettled } from './use-account-fetcher';
import { useProfileDraft, type ProfileDraft } from './use-profile-draft';

const SAVED_NOTICE_MS = 2000;

export type ProfileSectionProps = Readonly<{
  profile: ProfileDto;
  profileApi: ProfileApi;
  sessionStore: StoreApi<SessionStore>;
}>;

/** "Perfil": photo, nickname, the read-only @, color and "Sobre você", with the preview beside
 *  from `lg`. Nickname, color and bio wait in a draft for the bar; leaving with edits asks first.
 *
 *  Example: `<ProfileSection profile={profile} profileApi={profileApi} sessionStore={sessionStore} />` */
export function ProfileSection(props: ProfileSectionProps): React.JSX.Element {
  const { profile } = props;
  const draft = useProfileDraft(profile);
  const save = useProfileSave(draft);
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-6 border-t border-divider pt-8">
      <SectionHeading id={titleId} title="Perfil">
        Isso aparece em todas as mesas. O nome do personagem você muda dentro de cada mesa.
      </SectionHeading>
      <form
        noValidate
        aria-label="Perfil"
        aria-busy={save.saving}
        onSubmit={save.submit}
        className="flex flex-col gap-6"
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-6">
            <AvatarField
              profile={profile}
              profileApi={props.profileApi}
              sessionStore={props.sessionStore}
            />
            <ProfileFields draft={draft} username={profile.username} />
          </div>
          <ProfilePreview
            {...draft.values}
            username={profile.username}
            avatarId={profile.avatarId}
            memberSince={profile.memberSince}
          />
        </div>
        {save.barState && (
          <UnsavedChangesBar
            state={save.barState}
            invalid={draft.update === null}
            failureMessage={save.failureMessage}
            onDiscard={draft.discard}
          />
        )}
      </form>
      <LeaveWithoutSavingDialog dirty={draft.dirty} />
    </section>
  );
}

type ProfileSave = Readonly<{
  saving: boolean;
  barState: UnsavedChangesState | null;
  failureMessage: string | null;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}>;

function useProfileSave(draft: ProfileDraft): ProfileSave {
  const fetcher = useAccountFetcher();
  const [justSaved, setJustSaved] = useState(false);
  const failure = failureOf(fetcher.settled);
  useOnSettled(fetcher.settled, (result) => {
    if (!('done' in result)) return;
    draft.discard();
    setJustSaved(true);
  });
  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), SAVED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [justSaved]);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (draft.update) fetcher.send({ intent: 'profile-update', input: draft.update });
  };
  return {
    saving: fetcher.busy,
    barState: barStateOf(fetcher.busy, draft.dirty, justSaved),
    failureMessage: failure && draft.dirty ? accountFailureMessage(failure) : null,
    submit,
  };
}

function barStateOf(
  saving: boolean,
  dirty: boolean,
  justSaved: boolean,
): UnsavedChangesState | null {
  if (saving) return 'saving';
  if (dirty) return 'dirty';
  return justSaved ? 'saved' : null;
}

function ProfileFields({ draft, username }: Readonly<{ draft: ProfileDraft; username: string }>) {
  const ids = { name: useId(), bio: useId() };
  const { values, errors } = draft;
  return (
    <>
      <FormField
        id={ids.name}
        label="Apelido"
        error={errors.name}
        hint="Aparece para todo mundo nas mesas."
      >
        <Input
          id={ids.name}
          value={values.name}
          autoComplete="nickname"
          onChange={(event) => draft.change({ name: event.target.value })}
          aria-invalid={errors.name !== undefined}
          aria-describedby={errors.name ? `${ids.name}-error` : undefined}
        />
      </FormField>
      <UsernameLine username={username} />
      <ProfileColorField value={values.color} onChange={(color) => draft.change({ color })} />
      <FormField
        id={ids.bio}
        label="Sobre você"
        error={errors.bio}
        hint={`${values.bio.length}/${PROFILE_BIO_MAX_LENGTH} · aparece no seu cartão na mesa.`}
      >
        <Textarea
          id={ids.bio}
          value={values.bio}
          onChange={(event) => draft.change({ bio: event.target.value })}
          aria-invalid={errors.bio !== undefined}
          aria-describedby={errors.bio ? `${ids.bio}-error` : undefined}
        />
      </FormField>
    </>
  );
}

function UsernameLine({ username }: Readonly<{ username: string }>): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] font-medium text-label">Nome de usuário</span>
      <p className="text-[15px] text-foreground">@{username}</p>
      <p className="text-[13px] text-placeholder">É fixo: ele te identifica em todas as mesas.</p>
    </div>
  );
}
