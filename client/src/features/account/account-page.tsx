import type { StoreApi } from 'zustand/vanilla';
import type { Clipboard } from '@/services/clipboard';
import type { ProfileApi } from '@/services/profile-api';
import type { DicePreferencesStore } from '@/stores/dice-preferences-store';
import type { SessionStore } from '@/stores/session-store';
import type { AccountLoaderData } from './account-routes';
import { ProfileSection } from './profile-section';
import { SecuritySection } from './security-section';

export type AccountPageProps = AccountLoaderData &
  Readonly<{
    now: Date;
    profileApi: ProfileApi;
    sessionStore: StoreApi<SessionStore>;
    clipboard: Clipboard;
    dicePreferences: StoreApi<DicePreferencesStore>;
  }>;

/** "Minha conta": how the person shows up to the table (Perfil) and how they look after the
 *  account (Conta e segurança), one page under the shell, scrolled rather than tabbed.
 *
 *  Example: `<AccountPage {...useLoaderData()} now={now} profileApi={profileApi} sessionStore={sessionStore} clipboard={clipboard} dicePreferences={dicePreferences} />` */
export function AccountPage(props: AccountPageProps): React.JSX.Element {
  const { profile } = props;
  return (
    <div className="flex w-full flex-col gap-10 px-4 pt-10 sm:px-8 lg:px-12">
      <title>Lorkarium · Minha conta</title>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-[32px] font-semibold">Minha conta</h1>
        <p className="text-muted-foreground">
          Como você aparece para a mesa e como você cuida da sua conta.
        </p>
      </header>
      <ProfileSection
        profile={profile}
        profileApi={props.profileApi}
        sessionStore={props.sessionStore}
        dicePreferences={props.dicePreferences}
      />
      <div className="pb-16">
        <SecuritySection
          security={props.security}
          sessions={props.sessions}
          username={profile.username}
          now={props.now}
          clipboard={props.clipboard}
        />
      </div>
    </div>
  );
}
