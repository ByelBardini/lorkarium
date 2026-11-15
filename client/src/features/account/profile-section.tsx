import { PROFILE_BIO_MAX_LENGTH, type ProfileDto } from '@lorkarium/contracts';
import { useId } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Input } from '@/components/ui/input';
import { UserHandle } from '@/components/user-handle';
import type { ProfileApi } from '@/services/profile-api';
import type { ChatPreferencesStore } from '@/stores/chat-preferences-store';
import type { DicePreferencesStore } from '@/stores/dice-preferences-store';
import type { SessionStore } from '@/stores/session-store';
import { AvatarField } from './avatar-field';
import { BannerField } from './banner-field';
import { ChatDeviceSwitch } from './chat-device-switch';
import { DiceAppearanceField } from './dice-appearance-field';
import { DiceDeviceSwitches } from './dice-device-switches';
import { ProfileColorField } from './profile-color-field';
import { ProfileForm } from './profile-form';
import { ProfilePreview } from './profile-preview';
import { FieldError, ProfileTextRow } from './profile-text-row';
import { SectionHeading } from './section-heading';
import { SettingsLayout } from './settings-layout';
import { SettingsRow, SettingsRowPair } from './settings-row';
import { PREFERENCE_MAX_LENGTH, type ProfileDraft } from './use-profile-draft';
import type { ProfileEditor } from './use-profile-editor';

export type ProfileSectionProps = Readonly<{
  profile: ProfileDto;
  editor: ProfileEditor;
  profileApi: ProfileApi;
  sessionStore: StoreApi<SessionStore>;
  dicePreferences: StoreApi<DicePreferencesStore>;
  chatPreferences: StoreApi<ChatPreferencesStore>;
}>;

/** "Perfil": photo and banner (by plan) side by side, nickname, the read-only @, color, "Sobre você" and the dice ("Seus dados",
 *  "Dados 3D", "Som dos dados") and "Som do chat", one setting per row, with the preview held beside from `xl`.
 *  Systems, schedule and contact too.
 *  Nickname, color, bio, preferences and the dice number color wait in the page's draft for the bar.
 *
 *  Example: `<ProfileSection profile={profile} editor={editor} profileApi={profileApi} sessionStore={sessionStore} dicePreferences={dicePreferences} chatPreferences={chatPreferences} />` */
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
              bannerId={profile.bannerId}
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
      <SettingsRowPair>
        <AvatarField profile={profile} {...images} />
        <BannerField profile={profile} {...images} />
      </SettingsRowPair>
      <NicknameRow draft={draft} />
      <UsernameRow profile={profile} />
      <ColorRow draft={draft} />
      <ProfileTextRow
        draft={draft}
        field="bio"
        title="Sobre você"
        description="Aparece no seu cartão na mesa."
        max={PROFILE_BIO_MAX_LENGTH}
        rows={5}
      />
      <PreferenceRows draft={draft} />
      <DiceAppearanceField profile={profile} draft={draft} {...images} />
      <DiceDeviceSwitches dicePreferences={props.dicePreferences} />
      <ChatDeviceSwitch chatPreferences={props.chatPreferences} />
    </>
  );
}

type DraftRowProps = Readonly<{ draft: ProfileDraft }>;

function PreferenceRows({ draft }: DraftRowProps): React.JSX.Element {
  const max = PREFERENCE_MAX_LENGTH;
  return (
    <>
      <ProfileTextRow
        draft={draft}
        field="gameSystems"
        title="Sistemas e cenários"
        description="O que você joga ou mestra, em texto livre."
        max={max.gameSystems}
      />
      <ProfileTextRow
        draft={draft}
        field="playSchedule"
        title="Horários"
        description="Quando você costuma jogar."
        max={max.playSchedule}
      />
      <ProfileTextRow
        draft={draft}
        field="contact"
        title="Contato"
        description="Como falar com você fora do Lorkarium (Discord, e-mail…). Aparece no cartão completo."
        max={max.contact}
      />
    </>
  );
}

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
