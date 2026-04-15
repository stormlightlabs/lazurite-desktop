import type { SearchMode } from "./search";

export type ColumnKind = "feed" | "explorer" | "diagnostics" | "messages" | "search" | "profile";

export type ColumnWidth = "narrow" | "standard" | "wide";

export type Column = {
  id: string;
  accountDid: string;
  kind: ColumnKind;
  config: string;
  position: number;
  width: ColumnWidth;
  createdAt: string;
};

export type FeedKind = "timeline" | "feed" | "list";

export function isFeedType(value: unknown): value is FeedKind {
  return value === "timeline" || value === "feed" || value === "list";
}

export type FeedColumnConfig = { feedUri: string; feedType: FeedKind; title?: string | null };

export type ExplorerColumnConfig = { targetUri: string };

export type DiagnosticsColumnConfig = { did: string };

export type SearchColumnConfig = { mode: SearchMode; query: string };

export type ProfileColumnConfig = {
  actor: string;
  did?: string | null;
  displayName?: string | null;
  handle?: string | null;
};
