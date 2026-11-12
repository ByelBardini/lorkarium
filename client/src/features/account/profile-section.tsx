import { PROFILE_BIO_MAX_LENGTH, type ProfileDto } from '@lorkarium/contracts';
import { useId } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { UserHandle } from '@/components/user-handle';
import type { ProfileApi } from '@/services/profile-api';
import type { SessionStore } from '@/stores/session-store';
import { AvatarField } from './avatar-field';
import { ProfileColorField } from './profile-color-field';
import { ProfileForm } from './profile-form';
import { ProfilePreview } from './profile-preview';
import { SectionHeading } from './section-heading';
import type { ProfileDraft } from './use-profile-draft';
import type { ProfileEditor } from './use-profile-editor';

export type ProfileSectionProps = Readonly<{
  profile: ProfileDto;
  editor: ProfileEditor;
  profileApi: ProfileApi;
  sessionStore: StoreApi<SessionStore>;
}>;

/** "Perfil": photo, nickname, the read-only @, color and "Sobre você", with the preview beside
 *  from `lg`. Nickname, color and bio wait in the page's draft for the bar.
 *
 *  Example: `<ProfileSection profile={profile} editor={editor} profileApi={profileApi} sessionStore={sessionStore} />` */
export function ProfileSection(props: ProfileSectionProps): React.JSX.Element {
  const { profile, editor } = props;
  const { draft } = editor;
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-6">
      <SectionHeading id={titleId} title="Perfil">
        Isso aparece em todas as mesas. O nome do personagem você muda dentro de cada mesa.
      </SectionHeading>
      <ProfileForm label="Perfil" editor={editor}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-6">
            <AvatarField
              profile={profile}
              profileApi={props.profileApi}
              sessionStore={props.sessionStore}
            />
            <ProfileFields draft={draft} profile={profile} />
          </div>
          <ProfilePreview
            {...draft.values}
            username={profile.username}
            avatarId={profile.avatarId}
            memberSince={profile.memberSince}
            seal={profile}
          />
        </div>
      </ProfileForm>
    </section>
  );
}

function ProfileFields({ draft, profile }: Readonly<{ draft: ProfileDraft; profile: ProfileDto }>) {
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
      <UsernameLine profile={profile} />
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

function UsernameLine({ profile }: Readonly<{ profile: ProfileDto }>): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] font-medium text-label">Nome de usuário</span>
      <p className="text-[15px] text-foreground">
        <UserHandle username={profile.username} seal={profile} />
      </p>
      <p className="text-[13px] text-placeholder">É fixo: ele te identifica em todas as mesas.</p>
    </div>
  );
}
