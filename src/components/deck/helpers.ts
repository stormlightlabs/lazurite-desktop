import {
  type ColumnWidth,
  type DiagnosticsColumnConfig,
  type ExplorerColumnConfig,
  type FeedColumnConfig,
  isFeedType,
  type ProfileColumnConfig,
  type SearchColumnConfig,
} from "$/lib/api/types/columns";
import { getFeedName } from "$/lib/feeds";
import type { FeedGeneratorView, SavedFeedItem } from "$/lib/types";
import type { ResolvedFeedColumn } from "./types";

function feedConfigToSavedFeedItem(config: FeedColumnConfig): SavedFeedItem {
  return {
    id: config.feedUri || "following",
    pinned: false,
    type: config.feedType,
    value: config.feedUri || "following",
  };
}

function parseExplorerConfig(config: string): ExplorerColumnConfig | null {
  try {
    const parsed = JSON.parse(config) as unknown;
    if (parsed && typeof parsed === "object" && "targetUri" in parsed) {
      return parsed as ExplorerColumnConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export function cycleWidth(current: ColumnWidth): ColumnWidth {
  switch (current) {
    case "narrow": {
      return "standard";
    }
    case "standard": {
      return "wide";
    }
    case "wide": {
      return "narrow";
    }
  }
}

export function parseFeedConfig(config: string): FeedColumnConfig | null {
  try {
    const parsed = JSON.parse(config) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (!isFeedType(parsed.feedType) || typeof parsed.feedUri !== "string") {
      return null;
    }

    if (parsed.title !== undefined && parsed.title !== null && typeof parsed.title !== "string") {
      return null;
    }

    return { feedType: parsed.feedType, feedUri: parsed.feedUri, title: parsed.title as string | null | undefined };
  } catch {
    return null;
  }
}

export function parseDiagnosticsConfig(config: string): DiagnosticsColumnConfig | null {
  try {
    const parsed = JSON.parse(config) as unknown;
    if (parsed && typeof parsed === "object" && "did" in parsed) {
      return parsed as DiagnosticsColumnConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseSearchConfig(config: string): SearchColumnConfig | null {
  try {
    const parsed = JSON.parse(config) as unknown;
    if (parsed && typeof parsed === "object" && "mode" in parsed && "query" in parsed) {
      return parsed as SearchColumnConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseProfileConfig(config: string): ProfileColumnConfig | null {
  try {
    const parsed = JSON.parse(config) as unknown;
    if (parsed && typeof parsed === "object" && "actor" in parsed) {
      return parsed as ProfileColumnConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseColumnTitle(kind: string, config: string): string {
  switch (kind) {
    case "feed": {
      return "Feed";
    }
    case "explorer": {
      const parsed = parseExplorerConfig(config);
      if (!parsed?.targetUri) return "Explorer";
      return parsed.targetUri.length > 30 ? `${parsed.targetUri.slice(0, 30)}…` : parsed.targetUri;
    }
    case "diagnostics": {
      const parsed = parseDiagnosticsConfig(config);
      return parsed?.did ?? "Diagnostics";
    }
    case "messages": {
      return "Messages";
    }
    case "search": {
      const parsed = parseSearchConfig(config);
      const query = parsed?.query.trim();
      return query ? `Search: ${query}` : "Search";
    }
    case "profile": {
      const parsed = parseProfileConfig(config);
      return parsed?.displayName?.trim() || parsed?.handle?.trim() || parsed?.actor || "Profile";
    }
    default: {
      return "Column";
    }
  }
}

type Opts = { generator?: FeedGeneratorView; savedFeedTitle?: string | null };

export function resolveFeedColumn(config: FeedColumnConfig, options: Opts = {}): ResolvedFeedColumn {
  const feed = feedConfigToSavedFeedItem(config);
  const hydratedTitle = options.generator?.displayName || config.title?.trim() || options.savedFeedTitle?.trim();
  return { config, feed, generator: options.generator, title: getFeedName(feed, hydratedTitle) };
}
