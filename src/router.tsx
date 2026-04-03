import { useAppSession } from "$/contexts/app-session";
import { useAppShellUi } from "$/contexts/app-shell-ui";
import { HashRouter, Navigate, Route, useLocation, useNavigate, useParams } from "@solidjs/router";
import type { RouteSectionProps } from "@solidjs/router";
import { type Component, createEffect, type JSX, type ParentProps, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { DeckWorkspace } from "./components/deck/DeckWorkspace";
import { ExplorerPanel } from "./components/explorer/ExplorerPanel";
import { SavedPostsPanel } from "./components/saved/SavedPostsPanel";
import { SearchPanel } from "./components/search/SearchPanel";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { decodeMessagesRouteMemberDid } from "./lib/conversations";
import { buildThreadRoute, decodeThreadRouteUri, TIMELINE_ROUTE } from "./lib/feeds";
import { decodeProfileRouteActor } from "./lib/profile";

type TTimelineRouteProps = { context: { onThreadRouteChange: (uri: string | null) => void; threadUri: string | null } };
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
  renderTimeline: Component<TTimelineRouteProps>;
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

  const TimelineRoute = () => <TimelineRouteView renderTimeline={props.renderTimeline} threadUri={null} />;

  const ThreadRoute = () => {
    const params = useParams<{ threadUri: string }>();
    const threadUri = () => decodeThreadRouteUri(params.threadUri);

    return (
      <Show when={threadUri()} keyed fallback={<Navigate href={TIMELINE_ROUTE} />}>
        {(uri) => <TimelineRouteView renderTimeline={props.renderTimeline} threadUri={uri} />}
      </Show>
    );
  };

  const SearchRoute = () => (
    <ProtectedRouteView>
      <SearchPanel />
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
      <Route path="/timeline/thread/:threadUri" component={ThreadRoute} />
      <Route path="/profile" component={ProfileRoute} />
      <Route path="/profile/:actor" component={ActorProfileRoute} />
      <Route path="/composer" component={ComposerRoute} />
      <Route path="/search" component={SearchRoute} />
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

function TimelineRouteView(props: { renderTimeline: AppRouterProps["renderTimeline"]; threadUri: string | null }) {
  const navigate = useNavigate();

  return (
    <ProtectedRouteView>
      <Dynamic
        component={props.renderTimeline}
        context={{
          onThreadRouteChange: (uri: string | null) => navigate(uri ? buildThreadRoute(uri) : TIMELINE_ROUTE),
          threadUri: props.threadUri,
        }} />
    </ProtectedRouteView>
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
