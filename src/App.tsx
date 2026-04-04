import { getCurrentWindow } from "@tauri-apps/api/window";
// @ts-expect-error - erroneous font types missing
import "@fontsource-variable/google-sans";
import { useNavigate } from "@solidjs/router";
import type { ParentProps } from "solid-js";
import { createEffect, onCleanup, Show } from "solid-js";
import "./App.css";
import { AccountLedger } from "./components/account/AccountLedger";
import { ComposerWindow } from "./components/feeds/ComposerWindow";
import { FeedWorkspace } from "./components/feeds/FeedWorkspace";
import { LoginPanel } from "./components/LoginPanel";
import { MessagesPanel } from "./components/messages/MessagesPanel";
import { NotificationsPanel } from "./components/notifications/NotificationsPanel";
import { HeaderPanel } from "./components/panels/Header";
import { ThreadModal } from "./components/posts/ThreadModal";
import { ProfilePanel } from "./components/profile/ProfilePanel";
import { AppRail } from "./components/rail/AppRail";
import { SessionSpotlight } from "./components/Session";
import { ErrorToast } from "./components/shared/ErrorToast";
import { AppPreferencesProvider } from "./contexts/app-preferences";
import { AppSessionProvider, useAppSession } from "./contexts/app-session";
import { AppShellUiProvider, useAppShellUi } from "./contexts/app-shell-ui";
import { AppRouter } from "./router";

const COMPOSER_WINDOW_LABEL = "composer";

type AppShellProps = ParentProps<{ fullWidth?: boolean }>;

function createSettingsShortcutHandler(hasSession: boolean, navigate: (path: string) => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "," && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;
      if (!isInputFocused && hasSession) {
        navigate("/settings");
      }
    }
  };
}

function AppShell(props: AppShellProps) {
  const session = useAppSession();
  const shell = useAppShellUi();
  const navigate = useNavigate();

  createEffect(() => {
    const handler = createSettingsShortcutHandler(session.hasSession, navigate);
    globalThis.addEventListener("keydown", handler);
    onCleanup(() => globalThis.removeEventListener("keydown", handler));
  });

  return (
    <>
      <main
        class="grid h-screen min-h-screen overflow-hidden grid-cols-(--app-rail-cols) transition-[grid-template-columns] duration-300 ease-out max-[1180px]:h-auto max-[1180px]:min-h-screen max-[1180px]:grid-cols-1 max-[1180px]:overflow-visible"
        style={{ "--app-rail-cols": shell.railColumns }}>
        <AppRail />

        <section
          class="grid min-h-0 overflow-hidden bg-surface max-[1180px]:min-h-[calc(100vh-4.75rem)] max-[1180px]:overflow-visible"
          classList={{
            "m-5 gap-6 rounded-2xl p-6 shadow-[0_24px_40px_rgba(125,175,255,0.05)] max-[1360px]:p-6 max-[1180px]:m-0 max-[1180px]:rounded-none max-[1180px]:p-5 max-[900px]:gap-5 max-[900px]:p-4 max-[640px]:gap-4 max-[640px]:p-3":
              !props.fullWidth,
            "max-[1180px]:m-0 max-[1180px]:rounded-none": props.fullWidth,
          }}
          aria-busy={session.bootstrapping}>
          {props.children}
        </section>
      </main>

      <ThreadModal />
      <ErrorToast message={session.errorMessage} onDismiss={session.clearError} />
    </>
  );
}

function AppContent() {
  const session = useAppSession();
  const standaloneComposerWindow = isComposerWindow();

  return (
    <Show
      when={standaloneComposerWindow}
      fallback={
        <AppRouter
          renderAuth={() => <AuthWorkspace />}
          renderComposer={() => <ComposerWindow />}
          renderMessages={(props) => <MessagesPanel memberDid={props.memberDid} />}
          renderNotifications={() => <NotificationsPanel />}
          renderProfile={(props) => <ProfilePanel actor={props.actor} />}
          renderShell={AppShell}
          renderTimeline={() => <FeedWorkspace />} />
      }>
      <>
        <Show
          when={session.bootstrapping}
          fallback={
            <Show
              when={session.activeSession}
              keyed
              fallback={
                <div class="grid min-h-screen place-items-center bg-surface-container-lowest p-6">
                  <div class="w-full max-w-md">
                    <LoginPanel
                      value={session.loginValue}
                      pending={session.loggingIn}
                      shakeCount={session.shakeCount}
                      onInput={session.setLoginValue}
                      onSubmit={() => void session.submitLogin()} />
                  </div>
                </div>
              }>
              <ComposerWindow />
            </Show>
          }>
          <ComposerBootState />
        </Show>

        <ErrorToast message={session.errorMessage} onDismiss={session.clearError} />
      </>
    </Show>
  );
}

function App() {
  return (
    <AppSessionProvider>
      <AppPreferencesProvider>
        <AppShellUiProvider>
          <AppContent />
        </AppShellUiProvider>
      </AppPreferencesProvider>
    </AppSessionProvider>
  );
}

function isComposerWindow() {
  try {
    return getCurrentWindow().label === COMPOSER_WINDOW_LABEL;
  } catch {
    return false;
  }
}

function ComposerBootState() {
  return (
    <div class="grid min-h-screen place-items-center bg-surface-container-lowest p-6">
      <div class="grid gap-3 text-center">
        <p class="overline-copy text-sm text-on-surface-variant">Loading</p>
        <p class="m-0 text-base text-on-surface">Restoring the composer.</p>
      </div>
    </div>
  );
}

function AuthWorkspace() {
  const session = useAppSession();
  const hasAccounts = () => session.accounts.length > 0;

  return (
    <Show
      when={hasAccounts()}
      fallback={
        <div class="grid place-items-center py-8">
          <div class="w-full max-w-md">
            <LoginPanel
              value={session.loginValue}
              pending={session.loggingIn}
              shakeCount={session.shakeCount}
              onInput={session.setLoginValue}
              onSubmit={() => void session.submitLogin()} />
          </div>
        </div>
      }>
      <>
        <HeaderPanel metaLabel={session.metaLabel} />
        <SessionSpotlight />
        <AccountLedger />
      </>
    </Show>
  );
}

export default App;
