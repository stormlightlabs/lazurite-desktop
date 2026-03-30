import { render, screen } from "@solidjs/testing-library";
import type { Component, ParentProps } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { buildThreadRoute } from "./lib/feeds";
import type { ActiveSession } from "./lib/types";
import { AppRouter } from "./router";

const session: ActiveSession = { did: "did:plc:alice", handle: "alice.test" };

const Shell: Component<ParentProps> = (props) => <div>{props.children}</div>;

function renderRouter(hash: string) {
  globalThis.location.hash = hash;
  const renderComposer = vi.fn((currentSession: ActiveSession) => (
    <div data-testid="composer-view">{currentSession.handle}</div>
  ));
  const renderNotifications = vi.fn((currentSession: ActiveSession) => (
    <div data-testid="notifications-view">{currentSession.handle}</div>
  ));
  const renderTimeline = vi.fn((
    props: {
      session: ActiveSession;
      context: { onThreadRouteChange: (uri: string | null) => void; threadUri: string | null };
    },
  ) => (
    <div data-testid="timeline-view">
      <span>{props.session.handle}</span>
      <span>{props.context.threadUri ?? "no-thread"}</span>
    </div>
  ));

  render(() => (
    <AppRouter
      bootstrapping={false}
      hasSession
      renderAuth={() => <div>Auth</div>}
      renderComposer={renderComposer}
      renderNotifications={renderNotifications}
      renderShell={Shell}
      renderTimeline={renderTimeline}
      session={session} />
  ));

  return { renderComposer, renderNotifications, renderTimeline };
}

describe("AppRouter", () => {
  it("renders the timeline route without a thread uri", async () => {
    const { renderTimeline } = renderRouter("#/timeline");

    await screen.findByTestId("timeline-view");

    expect(renderTimeline).toHaveBeenCalled();
    expect(renderTimeline.mock.lastCall?.[0].context.threadUri).toBeNull();
    expect(screen.getByText("no-thread")).toBeInTheDocument();
  });

  it("passes the decoded thread uri on the thread route", async () => {
    const threadUri = "at://did:plc:alice/app.bsky.feed.post/xyz";
    const { renderTimeline } = renderRouter(`#${buildThreadRoute(threadUri)}`);

    await screen.findByTestId("timeline-view");

    expect(renderTimeline.mock.lastCall?.[0].context.threadUri).toBe(threadUri);
    expect(screen.getByText(threadUri)).toBeInTheDocument();
  });

  it("renders the standalone composer route", async () => {
    const { renderComposer } = renderRouter("#/composer");

    await screen.findByTestId("composer-view");

    expect(renderComposer).toHaveBeenCalledOnce();
    expect(screen.getByText(session.handle)).toBeInTheDocument();
  });

  it("renders the notifications route inside the protected shell", async () => {
    const { renderNotifications } = renderRouter("#/notifications");

    await screen.findByTestId("notifications-view");

    expect(renderNotifications).toHaveBeenCalledOnce();
    expect(screen.getByText(session.handle)).toBeInTheDocument();
  });
});
