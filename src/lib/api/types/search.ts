import type { ModerationLabel, PostView } from "$/lib/types";

export type SearchMode = "network" | "keyword" | "semantic" | "hybrid";

export type NetworkSearchSort = "top" | "latest";

export type NetworkSearchResult = { cursor?: string | null; hitsTotal?: number | null; posts: PostView[] };

export type NetworkSearchParams = {
  query: string;
  sort?: NetworkSearchSort;
  since?: string | null;
  until?: string | null;
  mentions?: string | null;
  author?: string | null;
  tags?: string[];
  limit?: number;
  cursor?: string | null;
};

export type ActorResult = {
  did: string;
  handle: string;
  displayName?: string | null;
  avatar?: string | null;
  description?: string | null;
  labels?: ModerationLabel[] | null;
};

export type ActorSearchResult = { cursor?: string | null; actors: ActorResult[] };

export type SavedPostSource = "like" | "bookmark";

export type LocalPostResult = {
  uri: string;
  cid: string;
  authorDid: string;
  authorHandle?: string | null;
  text?: string | null;
  createdAt?: string | null;
  source: SavedPostSource;
  score: number;
  keywordMatch: boolean;
  semanticMatch: boolean;
};

export type SavedPostsPage = { posts: LocalPostResult[]; total: number; nextOffset?: number | null };

export type SyncStatus = {
  did: string;
  source: SavedPostSource;
  cursor?: string | null;
  lastSyncedAt?: string | null;
  postCount?: number;
};

export type EmbeddingsConfig = {
  enabled: boolean;
  preflightSeen: boolean;
  modelName: string;
  dimensions: number;
  modelSizeBytes?: number | null;
  downloaded: boolean;
  downloadActive: boolean;
  downloadProgress?: number | null;
  downloadEtaSeconds?: number | null;
  downloadFile?: string | null;
  downloadFileIndex?: number | null;
  downloadFileTotal?: number | null;
  lastError?: string | null;
};
