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
import { buildThreadRoute, decodeThreadRouteUri, TIMELINE_ROUTE } from "./lib/feeds";
import type { ActiveSession } from "./lib/types";

type AppRouterProps = {
  bootstrapping: boolean;
  hasSession: boolean;
  onLocationChange?: () => void;
  renderAuth: () => JSX.Element;
  renderShell: Component<ParentProps>;
  renderTimeline: (
    session: ActiveSession,
    context: { onThreadRouteChange: (uri: string | null) => void; threadUri: string | null },
  ) => JSX.Element;
  session: ActiveSession | null;
};

export function AppRouter(props: AppRouterProps) {
  const RouterFrame: Component<RouteSectionProps> = (routeProps) => {
    const location = useLocation();
    let previousPath = location.pathname;

    createEffect(() => {
      const nextPath = location.pathname;
      if (nextPath !== previousPath) {
        props.onLocationChange?.();
        previousPath = nextPath;
      }
    });

    return <props.renderShell>{routeProps.children}</props.renderShell>;
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
      {() => (
        <FeaturePlaceholder
          eyebrow="Search"
          title="Local search is on deck."
          description="Keyword, semantic, and hybrid search routes are wired now. This view stays behind auth until the indexed search workflow lands." />
      )}
    </ProtectedRouteView>
  );

  const NotificationsRoute = () => (
    <ProtectedRouteView bootstrapping={props.bootstrapping} session={props.session}>
      {() => (
        <FeaturePlaceholder
          eyebrow="Notifications"
          title="Notification routing is gated."
          description="The notifications surface can now be added as an authenticated route without changing the shell again." />
      )}
    </ProtectedRouteView>
  );

  const ExplorerRoute = () => (
    <ProtectedRouteView bootstrapping={props.bootstrapping} session={props.session}>
      {() => (
        <FeaturePlaceholder
          eyebrow="AT Explorer"
          title="Explorer routing is ready."
          description="Deep-linked explorer screens can now mount as protected routes once the record and repository views are implemented." />
      )}
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
        props.renderTimeline(session, {
          onThreadRouteChange: (uri) => navigate(uri ? buildThreadRoute(uri) : TIMELINE_ROUTE),
          threadUri: props.threadUri,
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

function FeaturePlaceholder(props: { description: string; eyebrow: string; title: string }) {
  return (
    <article class="grid min-h-168 content-start gap-8 rounded-4xl bg-[linear-gradient(160deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-8 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]">
      <div class="flex items-baseline justify-between gap-4">
        <p class="overline-copy text-sm text-primary">{props.eyebrow}</p>
        <p class="overline-copy text-xs text-on-surface-variant">Authenticated route</p>
      </div>
      <div class="grid max-w-xl gap-4">
        <h1 class="m-0 text-[clamp(2.6rem,5vw,4.3rem)] tracking-tighter text-on-surface">{props.title}</h1>
        <p class="m-0 max-w-136 text-base leading-7 text-on-secondary-container">{props.description}</p>
      </div>
    </article>
  );
}
