import { buildHashtagRoute, toLocalDayStartIso, toLocalDayUntilIso } from "$/lib/search-routes";
import { AppTestProviders } from "$/test/providers";
import { HashRouter, Route } from "@solidjs/router";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HashtagPanel } from "./HashtagPanel";

const searchPostsNetworkMock = vi.hoisted(() => vi.fn());
const postNavigationMock = vi.hoisted(() => ({ backFromPost: vi.fn(), buildPostHref: vi.fn(), openPost: vi.fn() }));

vi.mock("$/lib/api/search", () => ({ SearchController: { searchPostsNetwork: searchPostsNetworkMock } }));
vi.mock("$/components/posts/usePostNavigation", () => ({ usePostNavigation: () => postNavigationMock }));
vi.mock("@tauri-apps/plugin-log", () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }));

async function flushRouter() {
  await Promise.resolve();
  await Promise.resolve();
}

function renderHashtagPanel(hash = `#${buildHashtagRoute("solid")}`) {
  globalThis.location.hash = hash;

  render(() => (
    <AppTestProviders>
      <HashRouter>
        <Route path="/hashtag/:hashtag" component={HashtagPanel} />
      </HashRouter>
    </AppTestProviders>
  ));
}

describe("HashtagPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchPostsNetworkMock.mockReset();
    postNavigationMock.openPost.mockReset();
    searchPostsNetworkMock.mockResolvedValue({ posts: [] });
  });

  it("searches the route hashtag using top sort by default", async () => {
    renderHashtagPanel();

    await vi.advanceTimersByTimeAsync(350);

    expect(searchPostsNetworkMock).toHaveBeenCalledWith({
      author: null,
      limit: 25,
      mentions: null,
      query: "#solid",
      since: null,
      sort: "top",
      tags: [],
      until: null,
    });
  });

  it("supports encoded hashtag paths", async () => {
    renderHashtagPanel("#/hashtag/%23solid");

    await vi.advanceTimersByTimeAsync(350);

    expect(searchPostsNetworkMock).toHaveBeenCalledWith(expect.objectContaining({ query: "#solid" }));
  });

  it("updates sort and filters via the URL", async () => {
    renderHashtagPanel("#/hashtag/solid?since=2026-04-01&until=2026-04-03&tags=rust");

    await vi.advanceTimersByTimeAsync(350);

    expect(searchPostsNetworkMock).toHaveBeenCalledWith({
      author: null,
      limit: 25,
      mentions: null,
      query: "#solid",
      since: toLocalDayStartIso("2026-04-01"),
      sort: "top",
      tags: ["rust"],
      until: toLocalDayUntilIso("2026-04-03"),
    });

    fireEvent.click(screen.getByRole("tab", { name: /latest/i }));
    await flushRouter();

    expect(globalThis.location.hash).toContain("sort=latest");

    await vi.advanceTimersByTimeAsync(350);

    expect(searchPostsNetworkMock).toHaveBeenLastCalledWith({
      author: null,
      limit: 25,
      mentions: null,
      query: "#solid",
      since: toLocalDayStartIso("2026-04-01"),
      sort: "latest",
      tags: ["rust"],
      until: toLocalDayUntilIso("2026-04-03"),
    });
  });
});
