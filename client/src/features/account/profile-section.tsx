import { PROFILE_BIO_MAX_LENGTH, type ProfileDto } from '@lorkarium/contracts';
import { useId } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { UserHandle } from '@/components/user-handle';
import type { ProfileApi } from '@/services/profile-api';
import type { DicePreferencesStore } from '@/stores/dice-preferences-store';
import type { SessionStore } from '@/stores/session-store';
import { AvatarField } from './avatar-field';
import { DiceAppearanceField } from './dice-appearance-field';
import { DiceDeviceSwitches } from './dice-device-switches';
import { ProfileColorField } from './profile-color-field';
import { ProfileForm } from './profile-form';
import { ProfilePreview } from './profile-preview';
import { SectionHeading } from './section-heading';
import { SettingsLayout } from './settings-layout';
import { SettingsRow } from './settings-row';
import type { ProfileDraft } from './use-profile-draft';
import type { ProfileEditor } from './use-profile-editor';

export type ProfileSectionProps = Readonly<{
  profile: ProfileDto;
  editor: ProfileEditor;
  profileApi: ProfileApi;
  sessionStore: StoreApi<SessionStore>;
  dicePreferences: StoreApi<DicePreferencesStore>;
}>;

/** "Perfil": photo, nickname, the read-only @, color, "Sobre você" and the dice ("Seus dados",
 *  "Dados 3D", "Som dos dados"), one setting per row, with the preview held beside from `xl`.
 *  Nickname, color, bio and the dice number color wait in the page's draft for the bar.
 *
 *  Example: `<ProfileSection profile={profile} editor={editor} profileApi={profileApi} sessionStore={sessionStore} dicePreferences={dicePreferences} />` */
export function ProfileSection(props: ProfileSectionProps): React.JSX.Element {
  const { profile, editor } = props;
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-8">
      <SectionHeading id={titleId} title="Perfil">
        Isso aparece em todas as mesas. O nome do personagem você muda dentro de cada mesa.
      </SectionHeading>
      <ProfileForm label="Perfil" editor={editor}>
        <SettingsLayout
          aside={
            <ProfilePreview
              {...editor.draft.values}
              username={profile.username}
              avatarId={profile.avatarId}
              memberSince={profile.memberSince}
              seal={profile}
            />
          }
        >
          <ProfileRows {...props} />
        </SettingsLayout>
      </ProfileForm>
    </section>
  );
}

function ProfileRows(props: ProfileSectionProps): React.JSX.Element {
  const { profile } = props;
  const { draft } = props.editor;
  const images = { profileApi: props.profileApi, sessionStore: props.sessionStore };
  return (
    <>
      <AvatarField profile={profile} {...images} />
      <NicknameRow draft={draft} />
      <UsernameRow profile={profile} />
      <ColorRow draft={draft} />
      <BioRow draft={draft} />
      <DiceAppearanceField profile={profile} draft={draft} {...images} />
      <DiceDeviceSwitches dicePreferences={props.dicePreferences} />
    </>
  );
}

type DraftRowProps = Readonly<{ draft: ProfileDraft }>;

function NicknameRow({ draft }: DraftRowProps): React.JSX.Element {
  const id = useId();
  const error = draft.errors.name;
  return (
    <SettingsRow title="Apelido" titleFor={id} description="Aparece para todo mundo nas mesas.">
      <Input
        id={id}
        value={draft.values.name}
        autoComplete="nickname"
        onChange={(event) => draft.change({ name: event.target.value })}
        aria-invalid={error !== undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <FieldError id={`${id}-error`} error={error} />
    </SettingsRow>
  );
}

function UsernameRow({ profile }: Readonly<{ profile: ProfileDto }>): React.JSX.Element {
  return (
    <SettingsRow title="Nome de usuário" description="É fixo: ele te identifica em todas as mesas.">
      <p className="flex h-12 items-center border border-divider px-4 text-[15px] text-label">
        <UserHandle username={profile.username} seal={profile} />
      </p>
    </SettingsRow>
  );
}

function ColorRow({ draft }: DraftRowProps): React.JSX.Element {
  const ids = { title: useId(), hint: useId() };
  return (
    <SettingsRow
      title="Sua cor no mapa"
      titleId={ids.title}
      descriptionId={ids.hint}
      description="Pinta seu ping no mapa e suas iniciais. Sem escolha, vale a cor que o Lorkarium sorteou."
    >
      <ProfileColorField
        value={draft.values.color}
        onChange={(color) => draft.change({ color })}
        labelledBy={ids.title}
        describedBy={ids.hint}
      />
    </SettingsRow>
  );
}

function BioRow({ draft }: DraftRowProps): React.JSX.Element {
  const id = useId();
  const error = draft.errors.bio;
  const length = draft.values.bio.length;
  return (
    <SettingsRow title="Sobre você" titleFor={id} description="Aparece no seu cartão na mesa.">
      <Textarea
        id={id}
        rows={5}
        value={draft.values.bio}
        onChange={(event) => draft.change({ bio: event.target.value })}
        aria-invalid={error !== undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <div className="flex justify-between gap-4">
        <FieldError id={`${id}-error`} error={error} />
        <p className="ml-auto text-sm text-placeholder tabular-nums">
          {length}/{PROFILE_BIO_MAX_LENGTH}
        </p>
      </div>
    </SettingsRow>
  );
}

function FieldError({ id, error }: Readonly<{ id: string; error: string | undefined }>) {
  if (!error) return null;
  return (
    <p id={id} className="text-sm text-destructive-text">
      {error}
    </p>
  );
}
