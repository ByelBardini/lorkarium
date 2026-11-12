import type { ProfileDto } from '@lorkarium/contracts';
import { useId } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { ProfileApi } from '@/services/profile-api';
import type { DicePreferencesStore } from '@/stores/dice-preferences-store';
import type { SessionStore } from '@/stores/session-store';
import { DiceAppearanceField } from './dice-appearance-field';
import { DiceDeviceSwitches } from './dice-device-switches';
import { ProfileForm } from './profile-form';
import { SectionHeading } from './section-heading';
import type { ProfileEditor } from './use-profile-editor';

export type DiceSectionProps = Readonly<{
  profile: ProfileDto;
  editor: ProfileEditor;
  profileApi: ProfileApi;
  sessionStore: StoreApi<SessionStore>;
  dicePreferences: StoreApi<DicePreferencesStore>;
}>;

/** "Dados": how the table sees the person's dice ("Seus dados") and how this device rolls them
 *  ("Dados 3D", "Som dos dados"). The number color waits in the page's draft for the bar.
 *
 *  Example: `<DiceSection profile={profile} editor={editor} profileApi={profileApi} sessionStore={sessionStore} dicePreferences={dicePreferences} />` */
export function DiceSection(props: DiceSectionProps): React.JSX.Element {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-6">
      <SectionHeading id={titleId} title="Dados">
        Como a mesa vê os seus dados e como este aparelho mostra as rolagens.
      </SectionHeading>
      <ProfileForm label="Dados" editor={props.editor}>
        <DiceAppearanceField
          profile={props.profile}
          draft={props.editor.draft}
          profileApi={props.profileApi}
          sessionStore={props.sessionStore}
        />
        <DiceDeviceSwitches dicePreferences={props.dicePreferences} />
      </ProfileForm>
    </section>
  );
}
