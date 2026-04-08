import { createRoot } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePostNavigation } from "../hooks/usePostNavigation";

const navigateMock = vi.hoisted(() => vi.fn());
const threadOverlayMock = vi.hoisted(() => ({
  buildThreadHref: vi.fn((uri: string | null) => (uri ? `/timeline?thread=${encodeURIComponent(uri)}` : "/timeline")),
  closeThread: vi.fn(),
  drawerEnabled: vi.fn(() => true),
  openThread: vi.fn(),
  threadUri: vi.fn(() => null),
}));

vi.mock("@solidjs/router", () => ({ useNavigate: () => navigateMock }));
vi.mock("../hooks/useThreadOverlayNavigation", () => ({ useThreadOverlayNavigation: () => threadOverlayMock }));

describe("usePostNavigation", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    threadOverlayMock.buildThreadHref.mockClear();
    threadOverlayMock.openThread.mockClear();
  });

  it("opens posts with thread overlay context", () => {
    createRoot((dispose) => {
      const navigation = usePostNavigation();
      void navigation.openPost("at://did:plc:alice/app.bsky.feed.post/1");
      dispose();
    });

    expect(threadOverlayMock.openThread).toHaveBeenCalledWith("at://did:plc:alice/app.bsky.feed.post/1");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("opens full-screen post routes explicitly", () => {
    createRoot((dispose) => {
      const navigation = usePostNavigation();
      void navigation.openPostScreen("at://did:plc:alice/app.bsky.feed.post/2");
      dispose();
    });

    expect(navigateMock).toHaveBeenCalledWith("/post/at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2F2");
  });

  it("builds and opens post engagement routes", () => {
    createRoot((dispose) => {
      const navigation = usePostNavigation();
      void navigation.openPostEngagement("at://did:plc:alice/app.bsky.feed.post/3", "quotes");
      dispose();
    });

    expect(navigateMock).toHaveBeenCalledWith(
      "/post/at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2F3/engagement?tab=quotes",
    );
  });

  it("delegates href building to thread overlay routing", () => {
    createRoot((dispose) => {
      const navigation = usePostNavigation();
      navigation.buildPostHref("at://did:plc:alice/app.bsky.feed.post/4");
      dispose();
    });

    expect(threadOverlayMock.buildThreadHref).toHaveBeenCalledWith("at://did:plc:alice/app.bsky.feed.post/4");
  });
});
