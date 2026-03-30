import {
  getAppBootstrap,
  login as loginRequest,
  logout as logoutRequest,
  switchAccount as switchAccountRequest,
} from "$/lib/api/app";
import { getUnreadCount } from "$/lib/api/notifications";
import { ACCOUNT_SWITCH_EVENT, NOTIFICATIONS_UNREAD_COUNT_EVENT } from "$/lib/constants/events";
import type { AccountSummary, ActiveSession } from "$/lib/types";
import { listen } from "@tauri-apps/api/event";
import {
  createContext,
  createMemo,
  onCleanup,
  onMount,
  type ParentProps,
  splitProps,
  startTransition,
  untrack,
  useContext,
} from "solid-js";
import { createStore } from "solid-js/store";

type AppSessionState = {
  accounts: AccountSummary[];
  activeSession: ActiveSession | null;
  bootstrapping: boolean;
  errorMessage: string | null;
  loggingIn: boolean;
  loginValue: string;
  logoutDid: string | null;
  reauthNeeded: boolean;
  shakeCount: number;
  switchingDid: string | null;
  unreadNotifications: number;
};

export type AppSessionContextValue = {
  readonly accounts: AccountSummary[];
  readonly activeAccount: AccountSummary | null;
  readonly activeAvatar: string | null;
  readonly activeDid: string | null;
  readonly activeHandle: string | null;
  readonly activeSession: ActiveSession | null;
  readonly bootstrapping: boolean;
  readonly errorMessage: string | null;
  readonly hasSession: boolean;
  readonly loggingIn: boolean;
  readonly loginValue: string;
  readonly logoutDid: string | null;
  readonly metaLabel: string;
  readonly primaryAccount: AccountSummary | null;
  readonly reauthNeeded: boolean;
  readonly shakeCount: number;
  readonly switchingDid: string | null;
  readonly unreadNotifications: number;
  clearError: () => void;
  logout: (did: string) => Promise<void>;
  markNotificationsSeen: () => void;
  reauthorizePrimaryAccount: () => Promise<void>;
  reportError: (message: string) => void;
  setLoginValue: (value: string) => void;
  submitLogin: (identifier?: string) => Promise<void>;
  switchAccount: (did: string) => Promise<void>;
};

const AppSessionContext = createContext<AppSessionContextValue>();

function createInitialAppSessionState(): AppSessionState {
  return {
    accounts: [],
    activeSession: null,
    bootstrapping: true,
    errorMessage: null,
    loggingIn: false,
    loginValue: "",
    logoutDid: null,
    reauthNeeded: false,
    shakeCount: 0,
    switchingDid: null,
    unreadNotifications: 0,
  };
}

function createAppSessionValue(): AppSessionContextValue {
  const [session, setSession] = createStore<AppSessionState>(createInitialAppSessionState());

  const activeAccount = createMemo(() =>
    session.accounts.find((account) => account.did === session.activeSession?.did) ?? null
  );
  const primaryAccount = createMemo(() => activeAccount() ?? session.accounts[0] ?? null);
  const hasSession = createMemo(() => !!session.activeSession);
  const metaLabel = createMemo(() => {
    if (session.bootstrapping) {
      return "reconnecting";
    }

    if (session.activeSession) {
      return "connected";
    }

    return "ready";
  });

  async function loadBootstrap() {
    setSession("bootstrapping", true);

    try {
      const payload = await getAppBootstrap();
      startTransition(() => {
        setSession("activeSession", payload.activeSession);
        setSession("accounts", payload.accountList);
        setSession("reauthNeeded", payload.accountList.length > 0 && !payload.activeSession);
      });

      if (payload.activeSession) {
        try {
          setSession("unreadNotifications", await getUnreadCount());
        } catch {
          setSession("unreadNotifications", 0);
        }
      } else {
        setSession("unreadNotifications", 0);
      }
    } catch (error) {
      setSession("errorMessage", `Failed to load app bootstrap: ${String(error)}`);
    } finally {
      setSession("bootstrapping", false);
    }
  }

  function triggerShake() {
    setSession("shakeCount", (count) => count + 1);
  }

  function markPotentialExpiry(error: unknown) {
    const message = String(error).toLowerCase();
    if (message.includes("refresh failed permanently") || message.includes("session does not exist")) {
      setSession("reauthNeeded", true);
    }
  }

  function setLoginValue(value: string) {
    setSession("loginValue", value);
  }

  function clearError() {
    setSession("errorMessage", null);
  }

  function reportError(message: string) {
    setSession("errorMessage", message);
  }

  function markNotificationsSeen() {
    setSession("unreadNotifications", 0);
  }

  async function submitLogin(identifier = session.loginValue) {
    const trimmed = identifier.trim();
    if (!validateIdentifier(trimmed)) {
      triggerShake();
      setSession("errorMessage", "Please enter a valid handle or DID.");
      return;
    }

    setSession("loggingIn", true);
    try {
      await loginRequest(trimmed);
      setSession("loginValue", "");
      await loadBootstrap();
    } catch (error) {
      markPotentialExpiry(error);
      setSession("errorMessage", `Authentication failed: ${String(error)}`);
    } finally {
      setSession("loggingIn", false);
    }
  }

  async function switchAccount(did: string) {
    setSession("switchingDid", did);
    try {
      await switchAccountRequest(did);
      await loadBootstrap();
    } catch (error) {
      markPotentialExpiry(error);
      setSession("errorMessage", `Failed to switch account: ${String(error)}`);
    } finally {
      setSession("switchingDid", null);
    }
  }

  async function logout(did: string) {
    setSession("logoutDid", did);
    try {
      await logoutRequest(did);
      await loadBootstrap();
    } catch (error) {
      markPotentialExpiry(error);
      setSession("errorMessage", `Failed to logout account: ${String(error)}`);
    } finally {
      setSession("logoutDid", null);
    }
  }

  async function reauthorizePrimaryAccount() {
    const account = primaryAccount();
    if (!account) {
      return;
    }

    await submitLogin(account.handle || account.did);
  }

  onMount(() => {
    let unlistenAccountSwitch: (() => void) | undefined;
    let unlistenUnreadCount: (() => void) | undefined;

    void loadBootstrap();

    void listen<ActiveSession | null>(ACCOUNT_SWITCH_EVENT, () => {
      void loadBootstrap();
    }).then((dispose) => {
      unlistenAccountSwitch = dispose;
    });

    void listen<number>(NOTIFICATIONS_UNREAD_COUNT_EVENT, (event) => {
      setSession("unreadNotifications", event.payload);
    }).then((dispose) => {
      unlistenUnreadCount = dispose;
    });

    onCleanup(() => {
      unlistenAccountSwitch?.();
      unlistenUnreadCount?.();
    });
  });

  return {
    get accounts() {
      return session.accounts;
    },
    get activeAccount() {
      return activeAccount();
    },
    get activeAvatar() {
      return activeAccount()?.avatar ?? null;
    },
    get activeDid() {
      return session.activeSession?.did ?? null;
    },
    get activeHandle() {
      return session.activeSession?.handle ?? null;
    },
    get activeSession() {
      return session.activeSession;
    },
    get bootstrapping() {
      return session.bootstrapping;
    },
    get errorMessage() {
      return session.errorMessage;
    },
    get hasSession() {
      return hasSession();
    },
    get loggingIn() {
      return session.loggingIn;
    },
    get loginValue() {
      return session.loginValue;
    },
    get logoutDid() {
      return session.logoutDid;
    },
    get metaLabel() {
      return metaLabel();
    },
    get primaryAccount() {
      return primaryAccount();
    },
    get reauthNeeded() {
      return session.reauthNeeded;
    },
    get shakeCount() {
      return session.shakeCount;
    },
    get switchingDid() {
      return session.switchingDid;
    },
    get unreadNotifications() {
      return session.unreadNotifications;
    },
    clearError,
    logout,
    markNotificationsSeen,
    reauthorizePrimaryAccount,
    reportError,
    setLoginValue,
    submitLogin,
    switchAccount,
  };
}

export function AppSessionProvider(props: ParentProps) {
  const value = createAppSessionValue();

  return <AppSessionContext.Provider value={value}>{props.children}</AppSessionContext.Provider>;
}

export function AppSessionContextProvider(props: ParentProps<{ value: AppSessionContextValue }>) {
  const [local] = splitProps(props, ["children", "value"]);
  const value = untrack(() => local.value);

  return <AppSessionContext.Provider value={value}>{local.children}</AppSessionContext.Provider>;
}

export function useAppSession() {
  const context = useContext(AppSessionContext);
  if (!context) {
    throw new Error("useAppSession must be used within an AppSessionProvider");
  }

  return context;
}

function validateIdentifier(value: string) {
  const trimmed = value.trim();
  const handlePattern = /^@?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
  const didPattern = /^did:[a-z]+:[a-zA-Z0-9._:%-]+$/;
  const urlPattern = /^https?:\/\/\S+$/i;
  return handlePattern.test(trimmed) || didPattern.test(trimmed) || urlPattern.test(trimmed);
}
