import { useLocation, useNavigate, useSearchParams } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Clipboard } from '@/services/clipboard';
import type { ProfileApi } from '@/services/profile-api';
import type { DicePreferencesStore } from '@/stores/dice-preferences-store';
import type { SessionStore } from '@/stores/session-store';
import type { AccountLoaderData } from './account-routes';
import {
  ACCOUNT_TAB_PARAM,
  ACCOUNT_TABS,
  accountTabOf,
  accountTabSearch,
  type AccountTab,
} from './account-tabs';
import { LeaveWithoutSavingDialog } from './leave-without-saving-dialog';
import { PlanSection } from './plan-section';
import { ProfileSection } from './profile-section';
import { SecuritySection } from './security-section';
import { useProfileEditor, type ProfileEditor } from './use-profile-editor';

export type AccountPageProps = AccountLoaderData &
  Readonly<{
    now: Date;
    profileApi: ProfileApi;
    sessionStore: StoreApi<SessionStore>;
    clipboard: Clipboard;
    dicePreferences: StoreApi<DicePreferencesStore>;
  }>;

/** "Minha conta" in tabs: how the person shows up to the table and rolls the dice (Perfil), how
 *  they look after the account (Segurança) and what their plan allows (Plano). The open tab is in
 *  `?aba=`; the profile draft is the page's, so an edit survives a switch of tab.
 *
 *  Example: `<AccountPage {...useLoaderData()} now={now} profileApi={profileApi} sessionStore={sessionStore} clipboard={clipboard} dicePreferences={dicePreferences} />` */
export function AccountPage(props: AccountPageProps): React.JSX.Element {
  const editor = useProfileEditor(props.profile);
  const [tab, openTab] = useAccountTab();
  return (
    <div className="flex w-full flex-col gap-3 px-4 pt-10 pb-16 sm:px-8 lg:px-12">
      <title>Lorkarium · Minha conta</title>
      <h1 className="font-display text-[32px] font-semibold">Minha conta</h1>
      <Tabs value={tab} onValueChange={(value) => openTab(accountTabOf(value))} className="gap-8">
        <AccountTabList profileEdited={editor.draft.dirty} />
        <AccountTabPanels {...props} editor={editor} />
      </Tabs>
      <LeaveWithoutSavingDialog dirty={editor.draft.dirty} />
    </div>
  );
}

function useAccountTab(): readonly [AccountTab, (tab: AccountTab) => void] {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const openTab = (next: AccountTab): void => {
    void navigate(
      { pathname, search: accountTabSearch(next) },
      { replace: true, preventScrollReset: true },
    );
  };
  return [accountTabOf(params.get(ACCOUNT_TAB_PARAM)), openTab];
}

// The dot on "Perfil": an unsaved edit waits there while another tab is open.
function AccountTabList({
  profileEdited,
}: Readonly<{ profileEdited: boolean }>): React.JSX.Element {
  return (
    <TabsList aria-label="Seções da conta" className="gap-8">
      {ACCOUNT_TABS.map(({ value, label }) => {
        const edited = profileEdited && value === 'perfil';
        return (
          <TabsTrigger
            key={value}
            value={value}
            className="h-12 text-[15px]"
            aria-label={edited ? `${label} (alterações não salvas)` : undefined}
          >
            {label}
            {edited && <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />}
          </TabsTrigger>
        );
      })}
    </TabsList>
  );
}

function AccountTabPanels(
  props: AccountPageProps & Readonly<{ editor: ProfileEditor }>,
): React.JSX.Element {
  const { profile, editor } = props;
  return (
    <>
      <TabsContent value="perfil">
        <ProfileSection
          profile={profile}
          editor={editor}
          profileApi={props.profileApi}
          sessionStore={props.sessionStore}
          dicePreferences={props.dicePreferences}
        />
      </TabsContent>
      <TabsContent value="seguranca">
        <SecuritySection
          security={props.security}
          sessions={props.sessions}
          username={profile.username}
          now={props.now}
          clipboard={props.clipboard}
        />
      </TabsContent>
      <TabsContent value="plano">
        <PlanSection plan={props.plan} account={profile} />
      </TabsContent>
    </>
  );
}
