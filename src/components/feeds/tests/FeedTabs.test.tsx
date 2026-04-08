import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { FeedTabBar } from "../FeedTabs";

describe("FeedTabBar", () => {
  it("renders feed labels without numeric badges", () => {
    render(() => (
      <FeedTabBar
        activeFeedId="for-you"
        generators={{
          "at://feed/quiet": {
            avatar: null,
            did: "did:plc:quiet",
            displayName: "Quiet Posters",
            uri: "at://feed/quiet",
          },
        }}
        onFeedSelect={vi.fn()}
        onToggleDrawer={vi.fn()}
        pinnedFeeds={[{ id: "for-you", pinned: true, type: "timeline", value: "following" }, {
          id: "quiet",
          pinned: true,
          type: "feed",
          value: "at://feed/quiet",
        }]} />
    ));

    expect(screen.getByRole("button", { name: /following/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /quiet posters/i })).toBeInTheDocument();
    expect(screen.queryByText(/^1$/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/^2$/u)).not.toBeInTheDocument();
  });
});
