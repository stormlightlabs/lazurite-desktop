import type { ColumnWidth, DiagnosticsColumnConfig, ExplorerColumnConfig, FeedColumnConfig } from "$/lib/api/columns";
import type { SavedFeedItem } from "$/lib/types";

export const COLUMN_WIDTH_PX: Record<ColumnWidth, number> = { narrow: 320, standard: 420, wide: 560 };

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
    const parsed = JSON.parse(config) as unknown;
    if (parsed && typeof parsed === "object" && "feedType" in parsed) {
      return parsed as FeedColumnConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseExplorerConfig(config: string): ExplorerColumnConfig | null {
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

export function feedConfigToSavedFeedItem(config: FeedColumnConfig): SavedFeedItem {
  return {
    id: config.feedUri || "following",
    pinned: false,
    type: config.feedType,
    value: config.feedUri || "following",
  };
}

export function columnTitle(kind: string, config: string): string {
  switch (kind) {
    case "feed": {
      const parsed = parseFeedConfig(config);
      if (!parsed) return "Feed";
      if (parsed.feedType === "timeline") return "Timeline";
      const segment = parsed.feedUri.split("/").at(-1)?.trim();
      return segment ? segment.replaceAll("-", " ") : (parsed.feedType === "list" ? "List" : "Feed");
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
    default: {
      return "Column";
    }
  }
}

export { type Column, type ColumnWidth } from "$/lib/api/columns";
