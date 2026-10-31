import type { ImagePresentationApi } from '@/services/image-presentation-api';
import type { DocumentsApi } from '@/services/documents-api';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';
import { DocumentWorkspaceHost } from '@/features/documents/document-workspace-host';
import { DocumentWorkspaceLifecycle } from '@/features/documents/document-workspace-lifecycle';
import type { AuthUserDto } from '@lorkarium/contracts';
import type { InteractionClock } from '@/lib/interaction-clock';
import {
  Outlet,
  redirect,
  useMatches,
  useNavigate,
  useSearchParams,
  type MiddlewareFunction,
  type RouteObject,
} from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import {
  accountRecoveryRoute,
  accountRoute,
  emailConfirmRoute,
} from '@/features/account/account-routes';
import { inviteRoute, passwordResetRoute } from '@/features/account-links/account-link-routes';
import { LoginPage } from '@/features/auth/login-page';
import { campaignTableRoute } from '@/features/campaigns/campaign-routes';
import { exploreRoute } from '@/features/explore/explore-route';
import { homeRoutes } from '@/features/home/home-route';
import { TextFieldMenu } from '@/features/text-field-menu/text-field-menu';
import { AppUpdateNotice } from '@/features/app-update/app-update-notice';
import { useTabActivity } from '@/features/sessions/use-tab-activity';
import { useLeaveDeletedTable } from '@/features/sessions/use-leave-deleted-table';
import { useSignOutWhenRefused } from '@/features/sessions/use-sign-out-when-refused';
import { safeRedirectTarget } from '@/lib/safe-redirect';
import type { AccountLinksApi } from '@/services/account-links-api';
import type { AccountSecurityApi } from '@/services/account-security-api';
import type { UserAdminApi } from '@/services/user-admin-api';
import type { AuthApi } from '@/services/auth-api';
import type { AssetsApi } from '@/services/assets-api';
import type { CampaignsApi } from '@/services/campaigns-api';
import type { LibraryApi } from '@/services/library-api';
import type { ProfileApi } from '@/services/profile-api';
import type { SceneActivation } from '@/services/scene-activation';
import type { Clipboard } from '@/services/clipboard';
import type { FieldEditing } from '@/services/field-editing';
import type { DesktopWindow } from '@/services/desktop-window';
import type { TableBoardCommands } from '@/services/table-board-commands';
import type { PingCommands } from '@/services/table-pings';
import type { ChatCommands } from '@/services/chat-commands';
import type { ChatWindowHost } from '@/services/chat-window-host';
import type { DiceCommands } from '@/services/dice-commands';
import type { SheetCommands } from '@/services/sheet-commands';
import type { SheetsApi } from '@/services/sheets-api';
import type { SheetTemplatesApi } from '@/services/sheet-templates-api';
import type { SheetEditorLayoutMemory } from '@/lib/sheet-editor-layout';
import type { SavedRollsApi } from '@/services/saved-rolls-api';
import type { DicePreferencesStore } from '@/stores/dice-preferences-store';
import type { DiceRendererFactory } from '@/dice-renderer/dice-renderer';
import type { DiceSoundFactory } from '@/dice-audio/dice-sound';
import type { OpenTablesStore } from '@/stores/open-tables-store';
import type { AppUpdateStore } from '@/stores/app-update-store';
import type { CreateBoardRenderer } from '@/renderer/board-renderer';
import type { RailStore } from '@/stores/rail-store';
import type { DrawingStyleStore } from '@/stores/drawing-style-store';
import type { EffectAreaStyleStore } from '@/stores/effect-area-style-store';
import type { WallStyleStore } from '@/stores/wall-style-store';
import type { LightColorStore } from '@/stores/light-color-store';
import type { AuraMotionStore } from '@/stores/aura-motion-store';
import type { LightReachStore } from '@/stores/light-reach-store';
import type { RoomLayoutStore } from '@/stores/room-layout-store';
import { useSession, type SessionStore } from '@/stores/session-store';
import { whoAmIOnceAnswered, type WaitBeforeRetry } from './boot-session';
import { decideAccess, type RouteAccess } from './route-access';
import { RouteErrorScreen } from './route-error-screen';
import { AppShell } from './shell/app-shell';
import { SplashScreen } from './splash-screen';
import { TitleBarFrame } from './title-bar/title-bar-frame';
import { placeOf, type PlaceHandle } from './title-bar/title-bar-place';

export type AppDependencies = Readonly<{
  authApi: AuthApi;
  campaignsApi: CampaignsApi;
  /** The person's own profile and photo ("Minha conta"). */
  profileApi: ProfileApi;
  /** Password, e-mail, signed-in devices and 2FA ("Minha conta"). */
  accountSecurityApi: AccountSecurityApi;
  /** The backoffice over the accounts and the invitations (admins only). */
  userAdminApi: UserAdminApi;
  /** The public side of the invitation and new-password links. */
  accountLinksApi: AccountLinksApi;
  /** The grids and folders of a table (the library). */
  libraryApi: LibraryApi;
  documentsApi: DocumentsApi;
  documentWorkspace: StoreApi<DocumentWorkspaceStore>;
  sheetsApi: SheetsApi;
  sheetTemplatesApi: SheetTemplatesApi;
  /** Where the template editor remembers its divider and console, per person. */
  sheetEditorLayout: SheetEditorLayoutMemory;
  sheetCommands: SheetCommands;
  imagePresentationApi: ImagePresentationApi;
  /** "Levar o grupo pra cá" (`scene:activate`). */
  sceneActivation: SceneActivation;
  /** Images sent to a table (file or link). */
  assets: AssetsApi;
  clipboard: Clipboard;
  /** Inside the desktop shell (Tauri), whose WebView2 has the browser's right-click menu off. */
  isDesktop: boolean;
  /** The frameless window of a desktop shell with its own title bar; `null` in a browser and in
   *  an older shell, which keeps the native frame. */
  desktopWindow: DesktopWindow | null;
  /** Cut, copy, paste and select-all on a text field (the desktop field menu). */
  fieldEditing: FieldEditing;
  openTables: StoreApi<OpenTablesStore>;
  sessionStore: StoreApi<SessionStore>;
  railStore: StoreApi<RailStore>;
  roomLayout: StoreApi<RoomLayoutStore>;
  /** How the next drawing looks, remembered in the browser. */
  drawingStyle: StoreApi<DrawingStyleStore>;
  /** The shape and color of the next area of effect, remembered in the browser. */
  effectAreaStyle: StoreApi<EffectAreaStyleStore>;
  /** The kind and shape of the next wall (the master), remembered in the browser. */
  wallStyle: StoreApi<WallStyleStore>;
  /** The bright and dim range of the next map light (the master), remembered in the browser. */
  lightReach: StoreApi<LightReachStore>;
  /** The color of the next map light (the master), remembered in the browser. */
  lightColor: StoreApi<LightColorStore>;
  /** "Animar auras" in this browser: the toolbar toggles it, the board renderer reads it. */
  auraMotion: StoreApi<AuraMotionStore>;
  /** The board canvas; PixiJS in the app, a fake in tests (jsdom has no WebGL). */
  createBoardRenderer: CreateBoardRenderer;
  boardCommands: TableBoardCommands;
  /** The ping of the board (`board:ping`), apart from the board commands. */
  pings: PingCommands;
  /** The roll of a table (`dice:roll`); the result arrives as `dice:rolled` to everyone. */
  dice: DiceCommands;
  /** The chat of a table (`chat:send`); the message arrives as `chat:sent` to whom it is for. */
  chat: ChatCommands;
  /** "Abrir em outra janela" of the chat: `window.open` in the app, a fake in tests. */
  chatWindowHost: ChatWindowHost;
  /** The session's own saved rolls at a table (REST). */
  savedRolls: SavedRollsApi;
  /** The dice history's own time (wall clock, `Date.now` in the app): the `revealAtMs` of each
   *  roll is on it, and so is the open tables' `wallClock`. */
  diceClock: InteractionClock;
  /** "Dados 3D" on this device, remembered in the browser (on by default). */
  dicePreferences: StoreApi<DicePreferencesStore>;
  /** The 3D dice over the window; three.js loaded on demand in the app, a fake in tests. */
  createDiceRenderer: DiceRendererFactory;
  /** The knocks of the rolls; Web Audio in the app, a fake in tests. */
  createDiceSound: DiceSoundFactory;
  /** The board's own time (the hover card's delay); the browser's in the app. */
  interactionClock: InteractionClock;
  /** The instant of the overline date; a parameter so tests fix the day. */
  now: () => Date;
  /** A draw in [0, 1) for the greeting; `Math.random` in the app. */
  random: () => number;
  /** The pause before the boot "who am I" is asked again, while the server does not answer. */
  waitBeforeRetry: WaitBeforeRetry;
  /** Whether a deploy published another client build than the one running. */
  appUpdate: StoreApi<AppUpdateStore>;
  /** The full reload into the new build; `location.reload()` in the app. */
  reloadPage: () => void;
}>;

/** Every route of the SPA, with the session resolved once at the root and a guard per route.
 *  Dependencies come in so tests can pass fakes and fresh stores.
 *
 *  Example: `createBrowserRouter(buildRoutes(dependencies))` */
export function buildRoutes(deps: AppDependencies): RouteObject[] {
  return [
    {
      id: 'root',
      middleware: [resolveSessionOnce(deps)],
      // The root middleware keeps the first navigation pending, so the splash covers the "who am I".
      HydrateFallback: bootSplash(deps),
      ErrorBoundary: rootErrorScreen(deps),
      Component: rootRoute(deps),
      children: [
        {
          path: 'login',
          middleware: [guard(deps, 'public-only')],
          handle: place('Entrar'),
          Component: loginRoute(deps),
        },
        {
          path: 'account/email/confirm',
          middleware: [guard(deps, 'anyone')],
          handle: place('Confirmar e-mail'),
          ...emailConfirmRoute(deps),
        },
        {
          path: 'account/recover',
          middleware: [guard(deps, 'anyone')],
          handle: place('Recuperar conta'),
          ...accountRecoveryRoute(deps),
        },
        {
          path: 'invite',
          middleware: [guard(deps, 'anyone')],
          handle: place('Convite'),
          ...inviteRoute(deps),
        },
        {
          path: 'reset-password',
          middleware: [guard(deps, 'anyone')],
          handle: place('Nova senha'),
          ...passwordResetRoute(deps),
        },
        {
          path: 'admin',
          middleware: [guard(deps, 'admin')],
          handle: place('Backoffice'),
          // Lazy: players never download the backoffice.
          lazy: async () => (await import('@/features/admin/admin-routes')).adminLayoutRoute(deps),
          children: [
            { index: true, loader: () => redirect('/admin/users') },
            {
              path: 'users',
              lazy: async () => (await import('@/features/admin/admin-routes')).usersRoute(deps),
            },
            {
              path: 'emails',
              lazy: async () => (await import('@/features/admin/admin-routes')).mailTestRoute(deps),
            },
          ],
        },
        {
          id: 'shell',
          middleware: [guard(deps, 'signed-in'), restoreOpenTables(deps)],
          Component: shellRoute(deps),
          children: [
            ...homeRoutes(deps).map((route) => withPlace(route, 'Suas mesas')),
            withPlace(exploreRoute(deps), 'Explorar mesas'),
            withPlace(accountRoute(deps), 'Minha conta'),
            campaignTableRoute(deps),
          ],
        },
        { path: '*', loader: () => redirect('/') },
      ],
    },
  ];
}

function place(name: string): PlaceHandle {
  return { place: name };
}

function withPlace(route: RouteObject, name: string): RouteObject {
  return { ...route, handle: { ...(route.handle as object | undefined), place: name } };
}

function rootRoute({
  isDesktop,
  desktopWindow,
  clipboard,
  fieldEditing,
  appUpdate,
  reloadPage,
  documentWorkspace,
  sessionStore,
}: AppDependencies): () => React.JSX.Element {
  return function RootRoute(): React.JSX.Element {
    return (
      <TitleBarFrame desktopWindow={desktopWindow} place={placeOf(useMatches())}>
        <Outlet />
        <DocumentWorkspaceLifecycle sessionStore={sessionStore} workspace={documentWorkspace} />
        <TextFieldMenu isDesktop={isDesktop} clipboard={clipboard} fieldEditing={fieldEditing} />
        <AppUpdateNotice appUpdate={appUpdate} reloadPage={reloadPage} />
      </TitleBarFrame>
    );
  };
}

function bootSplash({ sessionStore, desktopWindow }: AppDependencies): () => React.JSX.Element {
  return function BootSplash(): React.JSX.Element {
    return (
      <TitleBarFrame desktopWindow={desktopWindow} place={null}>
        <SplashScreen sessionStore={sessionStore} />
      </TitleBarFrame>
    );
  };
}

function rootErrorScreen({ desktopWindow }: AppDependencies): () => React.JSX.Element {
  return function RootErrorScreen(): React.JSX.Element {
    return (
      <TitleBarFrame desktopWindow={desktopWindow} place={null}>
        <RouteErrorScreen />
      </TitleBarFrame>
    );
  };
}

function resolveSessionOnce({
  authApi,
  sessionStore,
  waitBeforeRetry,
}: AppDependencies): MiddlewareFunction {
  return async () => {
    if (sessionStore.getState().session.status !== 'unknown') return;
    const unreachable = (): void => sessionStore.getState().serverUnreachable();
    const user = await whoAmIOnceAnswered(authApi, unreachable, waitBeforeRetry);
    if (user) sessionStore.getState().signedIn(user);
    else sessionStore.getState().signedOut();
  };
}

function guard({ sessionStore }: AppDependencies, access: RouteAccess): MiddlewareFunction {
  return ({ request }) => {
    const session = sessionStore.getState().session;
    if (session.status === 'unknown') {
      throw new Error(
        `route guard "${access}" ran before the session was resolved (${request.url})`,
      );
    }
    const decision = decideAccess(session, access, new URL(request.url));
    if (decision.kind === 'redirect') throw redirect(decision.to);
  };
}

// In the middleware, not in an effect of the shell: a child's effects run before its parent's,
// so the table screen would open its own table before the tab's list came back.
function restoreOpenTables({ sessionStore, openTables }: AppDependencies): MiddlewareFunction {
  return () => {
    const session = sessionStore.getState().session;
    if (session.status === 'authenticated') openTables.getState().restore(session.user.id);
  };
}

function loginRoute({
  authApi,
  sessionStore,
  isDesktop,
}: AppDependencies): () => React.JSX.Element {
  return function LoginRoute(): React.JSX.Element {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const enter = (user: AuthUserDto): void => {
      sessionStore.getState().signedIn(user);
      void navigate(safeRedirectTarget(searchParams.get('next')), { replace: true });
    };
    // The desktop app runs on the person's own computer: staying signed in is the expected default.
    return <LoginPage authApi={authApi} onAuthenticated={enter} rememberByDefault={isDesktop} />;
  };
}

function shellRoute(deps: AppDependencies): () => React.JSX.Element | null {
  const { authApi, sessionStore, railStore, openTables, interactionClock, desktopWindow } = deps;
  // Stable across renders: the activity watch restarts only when this changes.
  const setAway = (away: boolean): void => openTables.getState().setAway(away);
  return function ShellRoute(): React.JSX.Element | null {
    const session = useSession(sessionStore);
    const navigate = useNavigate();
    useSignOutWhenRefused(openTables, sessionStore);
    useLeaveDeletedTable(openTables);
    useTabActivity({ clock: interactionClock, onAway: setAway });
    if (session.status !== 'authenticated') return null;
    const signOut = async (): Promise<void> => {
      // Before the logout: once the session ends the server refuses the leaves, and the others
      // would only see these tables go after the grace period.
      openTables.getState().closeAll();
      deps.documentWorkspace.getState().clear();
      await authApi.logout();
      sessionStore.getState().signedOut();
      await navigate('/login', { replace: true });
    };
    return (
      <>
        <AppShell
          railStore={railStore}
          openTables={openTables}
          user={session.user}
          onSignOut={signOut}
          brandInTitleBar={desktopWindow !== null}
        />
        <DocumentWorkspaceHost deps={deps} />
      </>
    );
  };
}
