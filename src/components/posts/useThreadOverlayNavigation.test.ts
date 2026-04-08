import { createRoot } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useThreadOverlayNavigation } from "./useThreadOverlayNavigation";

const navigateMock = vi.hoisted(() => vi.fn());
const locationState = vi.hoisted(() => ({ pathname: "/timeline", search: "" }));

vi.mock("@solidjs/router", () => ({ useLocation: () => locationState, useNavigate: () => navigateMock }));

describe("useThreadOverlayNavigation", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    locationState.pathname = "/timeline";
    locationState.search = "";
  });

  it("opens threads in drawer mode on eligible routes", () => {
    createRoot((dispose) => {
      const overlay = useThreadOverlayNavigation();
      void overlay.openThread("at://did:plc:alice/app.bsky.feed.post/1");
      dispose();
    });

    expect(navigateMock).toHaveBeenCalledWith("/timeline?thread=at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2F1");
  });

  it("opens threads on the dedicated post route for ineligible paths", () => {
    locationState.pathname = "/search";
    locationState.search = "?q=test";

    createRoot((dispose) => {
      const overlay = useThreadOverlayNavigation();
      void overlay.openThread("at://did:plc:alice/app.bsky.feed.post/2");
      dispose();
    });

    expect(navigateMock).toHaveBeenCalledWith("/post/at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2F2");
  });

  it("closes drawer mode by removing only the thread query param", () => {
    locationState.pathname = "/notifications";
    locationState.search = "?foo=bar&thread=at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2F3";

    createRoot((dispose) => {
      const overlay = useThreadOverlayNavigation();
      void overlay.closeThread();
      dispose();
    });

    expect(navigateMock).toHaveBeenCalledWith("/notifications?foo=bar");
  });
});
