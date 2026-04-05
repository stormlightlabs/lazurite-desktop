import { useAppPreferences } from "$/contexts/app-preferences";
import { useAppSession } from "$/contexts/app-session";
import { useAppShellUi } from "$/contexts/app-shell-ui";
import { HashRouter, Navigate, Route, useLocation, useParams } from "@solidjs/router";
import type { RouteSectionProps } from "@solidjs/router";
import { type Component, createEffect, type JSX, type ParentProps, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { DeckWorkspace } from "./components/deck/DeckWorkspace";
import { ExplorerPanel } from "./components/explorer/ExplorerPanel";
import { SavedPostsPanel } from "./components/saved/SavedPostsPanel";
import { HashtagPanel } from "./components/search/HashtagPanel";
import { SearchPreflightPanel } from "./components/search/SearchPreflightPanel";
import { SearchPanel } from "./components/search/SearchPanel";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { decodeMessagesRouteMemberDid } from "./lib/conversations";
import { TIMELINE_ROUTE } from "./lib/feeds";
import { decodeProfileRouteActor } from "./lib/profile";
import { buildSearchPreflightRoute, decodeHashtagRouteTag, parseSearchRouteState } from "./lib/search-routes";

type TMessagesRouteProps = { memberDid: string | null };
type TProfileRouteProps = { actor: string | null };

type AppShellProps = ParentProps<{ fullWidth?: boolean }>;

type AppRouterProps = {
  renderAuth: () => JSX.Element;
  renderComposer: () => JSX.Element;
  renderMessages: Component<TMessagesRouteProps>;
  renderNotifications: () => JSX.Element;
  renderProfile: Component<TProfileRouteProps>;
  renderShell: Component<AppShellProps>;
  renderTimeline: () => JSX.Element;
};

export function AppRouter(props: AppRouterProps) {
  const session = useAppSession();
  const shell = useAppShellUi();

  const RouterFrame: Component<RouteSectionProps> = (routeProps) => {
    const location = useLocation();
    let previousPath = location.pathname;
    const standaloneComposerRoute = () => location.pathname === "/composer";

    createEffect(() => {
      const nextPath = location.pathname;
      if (nextPath !== previousPath) {
        shell.closeSwitcher();
        previousPath = nextPath;
      }
    });

    const fullWidthShell = () => location.pathname === "/explorer" || location.pathname === "/deck";

    return (
      <Show
        when={standaloneComposerRoute()}
        fallback={<props.renderShell fullWidth={fullWidthShell()}>{routeProps.children}</props.renderShell>}>
        {routeProps.children}
      </Show>
    );
  };

  const IndexRoute = () => (
    <Show when={!session.bootstrapping} fallback={<RouteLoadingState />}>
      <Navigate href={session.hasSession ? TIMELINE_ROUTE : "/auth"} />
    </Show>
  );

  const AuthRoute = () => <PublicOnlyRoute redirectHref={TIMELINE_ROUTE}>{props.renderAuth()}</PublicOnlyRoute>;

  const TimelineRoute = () => <ProtectedRouteView>{props.renderTimeline()}</ProtectedRouteView>;

  const SearchRoute = () => <ProtectedRouteView><SearchRouteGate /></ProtectedRouteView>;

  const SearchPreflightRoute = () => (
    <ProtectedRouteView>
      <SearchPreflightPanel />
    </ProtectedRouteView>
  );

  const ProfileRoute = () => (
    <ProtectedRouteView>
      <Dynamic component={props.renderProfile} actor={null} />
    </ProtectedRouteView>
  );

  const ActorProfileRoute = () => {
    const params = useParams<{ actor: string }>();

    return (
      <ProtectedRouteView>
        <Dynamic component={props.renderProfile} actor={decodeProfileRouteActor(params.actor)} />
      </ProtectedRouteView>
    );
  };

  const NotificationsRoute = () => <ProtectedRouteView>{props.renderNotifications()}</ProtectedRouteView>;

  const HashtagRoute = () => {
    const params = useParams<{ hashtag: string }>();
    const tag = decodeHashtagRouteTag(params.hashtag);

    return (
      <ProtectedRouteView>
        <Show when={tag} fallback={<Navigate href="/search" />}>
          <HashtagPanel />
        </Show>
      </ProtectedRouteView>
    );
  };

  const MessagesRoute = () => (
    <ProtectedRouteView>
      <Dynamic component={props.renderMessages} memberDid={null} />
    </ProtectedRouteView>
  );

  const MemberMessagesRoute = () => {
    const params = useParams<{ memberDid: string }>();

    return (
      <ProtectedRouteView>
        <Dynamic component={props.renderMessages} memberDid={decodeMessagesRouteMemberDid(params.memberDid)} />
      </ProtectedRouteView>
    );
  };

  const ComposerRoute = () => <ProtectedRouteView>{props.renderComposer()}</ProtectedRouteView>;

  const DeckRoute = () => (
    <ProtectedRouteView>
      <DeckWorkspace />
    </ProtectedRouteView>
  );

  const ExplorerRoute = () => (
    <ProtectedRouteView>
      <ExplorerPanel />
    </ProtectedRouteView>
  );

  const SettingsRoute = () => (
    <ProtectedRouteView>
      <SettingsPanel />
    </ProtectedRouteView>
  );

  const SavedPostsRoute = () => (
    <ProtectedRouteView>
      <SavedPostsPanel />
    </ProtectedRouteView>
  );

  const NotFoundRoute = () => (
    <Show when={session.bootstrapping} fallback={<Navigate href={session.hasSession ? TIMELINE_ROUTE : "/auth"} />}>
      <RouteLoadingState />
    </Show>
  );

  return (
    <HashRouter root={RouterFrame}>
      <Route path="/" component={IndexRoute} />
      <Route path="/auth" component={AuthRoute} />
      <Route path="/timeline" component={TimelineRoute} />
      <Route path="/profile" component={ProfileRoute} />
      <Route path="/profile/:actor" component={ActorProfileRoute} />
      <Route path="/composer" component={ComposerRoute} />
      <Route path="/search/preflight" component={SearchPreflightRoute} />
      <Route path="/search" component={SearchRoute} />
      <Route path="/hashtag/:hashtag" component={HashtagRoute} />
      <Route path="/saved" component={SavedPostsRoute} />
      <Route path="/notifications" component={NotificationsRoute} />
      <Route path="/messages" component={MessagesRoute} />
      <Route path="/messages/:memberDid" component={MemberMessagesRoute} />
      <Route path="/deck" component={DeckRoute} />
      <Route path="/explorer" component={ExplorerRoute} />
      <Route path="/settings" component={SettingsRoute} />
      <Route path="*404" component={NotFoundRoute} />
    </HashRouter>
  );
}

function SearchRouteGate() {
  const preferences = useAppPreferences();
  const location = useLocation();
  const routeState = () => parseSearchRouteState(location.search);
  const nextRoute = () => `${location.pathname}${location.search}`;
  const showLoading = () => preferences.embeddingsLoading && !preferences.embeddingsConfig;
  const shouldRedirect = () => {
    const config = preferences.embeddingsConfig;
    if (!config || routeState().tab !== "posts") {
      return false;
    }

    return !config.enabled && !config.preflightSeen;
  };

  return (
    <Show when={!showLoading()} fallback={<RouteLoadingState />}>
      <Show when={!shouldRedirect()} fallback={<Navigate href={buildSearchPreflightRoute(nextRoute())} />}>
        <SearchPanel />
      </Show>
    </Show>
  );
}

function PublicOnlyRoute(props: ParentProps & { redirectHref: string }) {
  const session = useAppSession();

  return (
    <Show when={!session.hasSession || session.bootstrapping} fallback={<Navigate href={props.redirectHref} />}>
      {props.children}
    </Show>
  );
}

function ProtectedRouteView(props: ParentProps) {
  const session = useAppSession();

  return (
    <Show
      when={session.bootstrapping}
      fallback={<Show when={session.activeSession} fallback={<Navigate href="/auth" />}>{props.children}</Show>}>
      <RouteLoadingState />
    </Show>
  );
}

function RouteLoadingState() {
  return (
    <div class="grid min-h-168 place-items-center rounded-4xl bg-white/2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
      <div class="grid gap-3 text-center">
        <p class="overline-copy text-sm text-on-surface-variant">Loading</p>
        <p class="m-0 text-base text-on-surface">Restoring your workspace.</p>
      </div>
    </div>
  );
}
