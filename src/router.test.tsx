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
  const renderTimeline = vi.fn((currentSession: ActiveSession, context: { threadUri: string | null }) => (
    <div data-testid="timeline-view">
      <span>{currentSession.handle}</span>
      <span>{context.threadUri ?? "no-thread"}</span>
    </div>
  ));

  render(() => (
    <AppRouter
      bootstrapping={false}
      hasSession
      renderAuth={() => <div>Auth</div>}
      renderShell={Shell}
      renderTimeline={renderTimeline}
      session={session} />
  ));

  return { renderTimeline };
}

describe("AppRouter", () => {
  it("renders the timeline route without a thread uri", async () => {
    const { renderTimeline } = renderRouter("#/timeline");

    await screen.findByTestId("timeline-view");

    expect(renderTimeline).toHaveBeenCalled();
    expect(renderTimeline.mock.lastCall?.[1].threadUri).toBeNull();
    expect(screen.getByText("no-thread")).toBeInTheDocument();
  });

  it("passes the decoded thread uri on the thread route", async () => {
    const threadUri = "at://did:plc:alice/app.bsky.feed.post/xyz";
    const { renderTimeline } = renderRouter(`#${buildThreadRoute(threadUri)}`);

    await screen.findByTestId("timeline-view");

    expect(renderTimeline.mock.lastCall?.[1].threadUri).toBe(threadUri);
    expect(screen.getByText(threadUri)).toBeInTheDocument();
  });
});
