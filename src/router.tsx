import {
  HashRouter,
  Navigate,
  Route,
  type RouteSectionProps,
  useLocation,
  useNavigate,
  useParams,
} from "@solidjs/router";
import { type Component, createEffect, type JSX, type ParentProps, Show } from "solid-js";
import { ExplorerPanel } from "./components/explorer/ExplorerPanel";
import { SearchPanel } from "./components/search/SearchPanel";
import { buildThreadRoute, decodeThreadRouteUri, TIMELINE_ROUTE } from "./lib/feeds";
import type { ActiveSession } from "./lib/types";

type AppRouterProps = {
  bootstrapping: boolean;
  hasSession: boolean;
  onLocationChange?: () => void;
  renderAuth: () => JSX.Element;
  renderComposer: (session: ActiveSession) => JSX.Element;
  renderNotifications: (session: ActiveSession) => JSX.Element;
  renderShell: Component<ParentProps>;
  renderTimeline: Component<
    { session: ActiveSession; context: { onThreadRouteChange: (uri: string | null) => void; threadUri: string | null } }
  >;
  session: ActiveSession | null;
};

export function AppRouter(props: AppRouterProps) {
  const RouterFrame: Component<RouteSectionProps> = (routeProps) => {
    const location = useLocation();
    let previousPath = location.pathname;
    const standaloneComposerRoute = () => location.pathname === "/composer";

    createEffect(() => {
      const nextPath = location.pathname;
      if (nextPath !== previousPath) {
        props.onLocationChange?.();
        previousPath = nextPath;
      }
    });

    return (
      <Show when={standaloneComposerRoute()} fallback={<props.renderShell>{routeProps.children}</props.renderShell>}>
        {routeProps.children}
      </Show>
    );
  };

  const IndexRoute = () => (
    <Show when={!props.bootstrapping} fallback={<RouteLoadingState />}>
      <Navigate href={props.hasSession ? TIMELINE_ROUTE : "/auth"} />
    </Show>
  );

  const AuthRoute = () => (
    <PublicOnlyRoute bootstrapping={props.bootstrapping} when={!props.hasSession} redirectHref={TIMELINE_ROUTE}>
      {props.renderAuth()}
    </PublicOnlyRoute>
  );

  const TimelineRoute = () => (
    <TimelineRouteView
      bootstrapping={props.bootstrapping}
      renderTimeline={props.renderTimeline}
      session={props.session}
      threadUri={null} />
  );

  const ThreadRoute = () => {
    const params = useParams<{ threadUri: string }>();
    const threadUri = () => decodeThreadRouteUri(params.threadUri);

    return (
      <Show when={threadUri()} keyed fallback={<Navigate href={TIMELINE_ROUTE} />}>
        {(uri) => (
          <TimelineRouteView
            bootstrapping={props.bootstrapping}
            renderTimeline={props.renderTimeline}
            session={props.session}
            threadUri={uri} />
        )}
      </Show>
    );
  };

  const SearchRoute = () => (
    <ProtectedRouteView bootstrapping={props.bootstrapping} session={props.session}>
      {(session) => <SearchPanel session={session} />}
    </ProtectedRouteView>
  );

  const NotificationsRoute = () => (
    <ProtectedRouteView bootstrapping={props.bootstrapping} session={props.session}>
      {(session) => props.renderNotifications(session)}
    </ProtectedRouteView>
  );

  const ComposerRoute = () => (
    <ProtectedRouteView bootstrapping={props.bootstrapping} session={props.session}>
      {(session) => props.renderComposer(session)}
    </ProtectedRouteView>
  );

  const ExplorerRoute = () => (
    <ProtectedRouteView bootstrapping={props.bootstrapping} session={props.session}>
      {() => <ExplorerPanel />}
    </ProtectedRouteView>
  );

  const NotFoundRoute = () => (
    <Show when={!props.bootstrapping} fallback={<RouteLoadingState />}>
      <Navigate href={props.hasSession ? TIMELINE_ROUTE : "/auth"} />
    </Show>
  );

  return (
    <HashRouter root={RouterFrame}>
      <Route path="/" component={IndexRoute} />
      <Route path="/auth" component={AuthRoute} />
      <Route path="/timeline" component={TimelineRoute} />
      <Route path="/timeline/thread/:threadUri" component={ThreadRoute} />
      <Route path="/composer" component={ComposerRoute} />
      <Route path="/search" component={SearchRoute} />
      <Route path="/notifications" component={NotificationsRoute} />
      <Route path="/explorer" component={ExplorerRoute} />
      <Route path="*404" component={NotFoundRoute} />
    </HashRouter>
  );
}

function TimelineRouteView(
  props: {
    bootstrapping: boolean;
    renderTimeline: AppRouterProps["renderTimeline"];
    session: ActiveSession | null;
    threadUri: string | null;
  },
) {
  const navigate = useNavigate();

  return (
    <ProtectedRouteView bootstrapping={props.bootstrapping} session={props.session}>
      {(session) =>
        props.renderTimeline({
          session,
          context: {
            onThreadRouteChange: (uri) => navigate(uri ? buildThreadRoute(uri) : TIMELINE_ROUTE),
            threadUri: props.threadUri,
          },
        })}
    </ProtectedRouteView>
  );
}

function PublicOnlyRoute(props: ParentProps & { bootstrapping: boolean; when: boolean; redirectHref: string }) {
  return (
    <Show when={props.when || props.bootstrapping} fallback={<Navigate href={props.redirectHref} />}>
      {props.children}
    </Show>
  );
}

function ProtectedRouteView(
  props: { bootstrapping: boolean; session: ActiveSession | null; children: (session: ActiveSession) => JSX.Element },
) {
  return (
    <Show when={!props.bootstrapping} fallback={<RouteLoadingState />}>
      <Show when={props.session} keyed fallback={<Navigate href="/auth" />}>
        {(session) => props.children(session)}
      </Show>
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
