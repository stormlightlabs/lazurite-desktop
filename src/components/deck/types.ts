import type { ColumnWidth, FeedColumnConfig } from "$/lib/api/types/columns";
import type { FeedGeneratorView, SavedFeedItem } from "$/lib/types";

export const COLUMN_WIDTH_PX: Record<ColumnWidth, number> = { narrow: 320, standard: 420, wide: 560 };

export type ResolvedFeedColumn = {
  config: FeedColumnConfig;
  feed: SavedFeedItem;
  generator?: FeedGeneratorView;
  title: string;
};

export type FeedPickerSelection = { feed: SavedFeedItem; title: string };

export type ProfileSelection = {
  actor: string;
  did?: string | null;
  displayName?: string | null;
  handle?: string | null;
};
