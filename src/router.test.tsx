import { AppTestProviders } from "$/test/providers";
import { render, screen } from "@solidjs/testing-library";
import type { Component, ParentProps } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMessagesRoute } from "./lib/conversations";
import { buildProfileRoute } from "./lib/profile";
import { AppRouter } from "./router";

const listenMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));
vi.mock(
  "$/components/saved/SavedPostsPanel",
  () => ({ SavedPostsPanel: () => <div data-testid="saved-posts-view">saved</div> }),
);
vi.mock(
  "$/components/search/HashtagPanel",
  () => ({ HashtagPanel: () => <div data-testid="hashtag-view">hashtag</div> }),
);

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
  const renderTimeline = vi.fn(() => <div data-testid="timeline-view">timeline</div>);

  const renderMessages = vi.fn((props: { memberDid: string | null }) => (
    <div data-testid="messages-view">{props.memberDid ?? "messages"}</div>
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
        renderMessages={renderMessages}
        renderNotifications={renderNotifications}
        renderProfile={renderProfile}
        renderShell={Shell}
        renderTimeline={renderTimeline} />
    </AppTestProviders>
  ));

  return { renderComposer, renderMessages, renderNotifications, renderProfile, renderTimeline };
}

describe("AppRouter", () => {
  beforeEach(() => {
    listenMock.mockReset();
    listenMock.mockResolvedValue(() => {});
  });

  it("renders the timeline route", async () => {
    const { renderTimeline } = renderRouter("#/timeline");

    await screen.findByTestId("timeline-view");

    expect(renderTimeline).toHaveBeenCalledOnce();
    expect(screen.getByText("timeline")).toBeInTheDocument();
  });

  it("renders the timeline route with query params intact", async () => {
    const { renderTimeline } = renderRouter(
      "#/timeline?thread=at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2Fxyz",
    );

    await screen.findByTestId("timeline-view");

    expect(renderTimeline).toHaveBeenCalledOnce();
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

  it("renders the saved posts route inside the protected shell", async () => {
    renderRouter("#/saved");

    await screen.findByTestId("saved-posts-view");

    expect(screen.getByText("saved")).toBeInTheDocument();
    expect(screen.getByTestId("shell")).toHaveAttribute("data-full-width", "false");
  });

  it("passes the decoded member did on targeted message routes", async () => {
    const memberDid = "did:plc:bob";
    const { renderMessages } = renderRouter(`#${buildMessagesRoute(memberDid)}`);

    await screen.findByTestId("messages-view");

    expect(renderMessages.mock.lastCall?.[0].memberDid).toBe(memberDid);
    expect(screen.getByText(memberDid)).toBeInTheDocument();
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

  it("renders hashtag routes inside the protected shell", async () => {
    renderRouter("#/hashtag/solid");

    await screen.findByTestId("hashtag-view");

    expect(screen.getByText("hashtag")).toBeInTheDocument();
    expect(screen.getByTestId("shell")).toHaveAttribute("data-full-width", "false");
  });

  it("renders encoded hashtag routes", async () => {
    renderRouter("#/hashtag/%23solid");

    await screen.findByTestId("hashtag-view");

    expect(screen.getByText("hashtag")).toBeInTheDocument();
  });
});
