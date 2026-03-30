import { AppTestProviders } from "$/test/providers";
import { render, screen } from "@solidjs/testing-library";
import type { Component, ParentProps } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildThreadRoute } from "./lib/feeds";
import { buildProfileRoute } from "./lib/profile";
import { AppRouter } from "./router";

const listenMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

const Shell: Component<ParentProps<{ fullWidth?: boolean }>> = (props) => (
  <div data-testid="shell" data-full-width={props.fullWidth ? "true" : "false"}>{props.children}</div>
);

function renderRouter(hash: string) {
  globalThis.location.hash = hash;
  const renderComposer = vi.fn(() => <div data-testid="composer-view">composer</div>);
  const renderNotifications = vi.fn(() => <div data-testid="notifications-view">notifications</div>);
  const renderProfile = vi.fn((props: { actor: string | null }) => (
    <div data-testid="profile-view">
      <span>{props.actor ?? "self-profile"}</span>
    </div>
  ));
  const renderTimeline = vi.fn((
    props: { context: { onThreadRouteChange: (uri: string | null) => void; threadUri: string | null } },
  ) => (
    <div data-testid="timeline-view">
      <span>{props.context.threadUri ?? "no-thread"}</span>
    </div>
  ));

  render(() => (
    <AppTestProviders
      session={{
        activeDid: "did:plc:alice",
        activeHandle: "alice.test",
        activeSession: { did: "did:plc:alice", handle: "alice.test" },
      }}>
      <AppRouter
        renderAuth={() => <div>Auth</div>}
        renderComposer={renderComposer}
        renderNotifications={renderNotifications}
        renderProfile={renderProfile}
        renderShell={Shell}
        renderTimeline={renderTimeline} />
    </AppTestProviders>
  ));

  return { renderComposer, renderNotifications, renderProfile, renderTimeline };
}

describe("AppRouter", () => {
  beforeEach(() => {
    listenMock.mockReset();
    listenMock.mockResolvedValue(() => {});
  });

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
    expect(screen.getByText("composer")).toBeInTheDocument();
  });

  it("renders the notifications route inside the protected shell", async () => {
    const { renderNotifications } = renderRouter("#/notifications");

    await screen.findByTestId("notifications-view");

    expect(renderNotifications).toHaveBeenCalledOnce();
    expect(screen.getByText("notifications")).toBeInTheDocument();
    expect(screen.getByTestId("shell")).toHaveAttribute("data-full-width", "false");
  });

  it("renders the explorer route inside the full-width shell", async () => {
    renderRouter("#/explorer");

    await screen.findByTestId("shell");

    expect(screen.getByTestId("shell")).toHaveAttribute("data-full-width", "true");
  });

  it("renders the logged-in profile route", async () => {
    const { renderProfile } = renderRouter("#/profile");

    await screen.findByTestId("profile-view");

    expect(renderProfile.mock.lastCall?.[0].actor).toBeNull();
    expect(screen.getByText("self-profile")).toBeInTheDocument();
  });

  it("passes the decoded actor on other profile routes", async () => {
    const actor = "alice.bsky.social";
    const { renderProfile } = renderRouter(`#${buildProfileRoute(actor)}`);

    await screen.findByTestId("profile-view");

    expect(renderProfile.mock.lastCall?.[0].actor).toBe(actor);
    expect(screen.getByText(actor)).toBeInTheDocument();
  });
});
