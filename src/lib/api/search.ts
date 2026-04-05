import type { PostView } from "$/lib/types";
import { invoke } from "@tauri-apps/api/core";

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

type TActor = {
  did: string;
  handle: string;
  displayName?: string | null;
  avatar?: string | null;
  description?: string | null;
};

export type ActorSearchResult = { cursor?: string | null; actors: TActor[] };

type TStarterPack = {
  uri: string;
  cid: string;
  record: { name: string; description?: string; createdAt: string };
  creator: { did: string; handle: string; displayName?: string | null; avatar?: string | null };
  indexedAt: string;
};

export type StarterPackSearchResult = { cursor?: string | null; starterPacks: Array<TStarterPack> };

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

export function searchPostsNetwork(params: NetworkSearchParams): Promise<NetworkSearchResult> {
  return invoke("search_posts_network", {
    queryParams: {
      author: params.author ?? null,
      cursor: params.cursor ?? null,
      limit: params.limit ?? null,
      mentions: params.mentions ?? null,
      query: params.query,
      since: params.since ?? null,
      sort: params.sort ?? null,
      tags: params.tags?.length ? params.tags : null,
      until: params.until ?? null,
    },
  });
}

export function searchPosts(query: string, mode: SearchMode, limit: number): Promise<LocalPostResult[]> {
  return invoke("search_posts", { query, mode, limit });
}

export function listSavedPosts(
  source: SavedPostSource,
  limit: number,
  offset = 0,
  query?: string,
): Promise<SavedPostsPage> {
  return invoke("list_saved_posts", { source, limit, offset, query: query?.trim() ? query.trim() : null });
}

export function searchActors(query: string, limit?: number, cursor?: string | null): Promise<ActorSearchResult> {
  return invoke("search_actors", { query, limit: limit ?? null, cursor: cursor ?? null });
}

export function searchStarterPacks(
  query: string,
  limit?: number,
  cursor?: string | null,
): Promise<StarterPackSearchResult> {
  return invoke("search_starter_packs", { query, limit: limit ?? null, cursor: cursor ?? null });
}

export function syncPosts(did: string, source: SavedPostSource): Promise<SyncStatus> {
  return invoke("sync_posts", { did, source });
}

export function getSyncStatus(did: string): Promise<SyncStatus[]> {
  return invoke("get_sync_status", { did });
}

export function embedPendingPosts(): Promise<number> {
  return invoke("embed_pending_posts");
}

export function reindexEmbeddings(): Promise<number> {
  return invoke("reindex_embeddings");
}

export function setEmbeddingsEnabled(enabled: boolean): Promise<void> {
  return invoke("set_embeddings_enabled", { enabled });
}

export function setEmbeddingsPreflightSeen(seen: boolean): Promise<void> {
  return invoke("set_embeddings_preflight_seen", { seen });
}

export function getEmbeddingsEnabled(): Promise<boolean> {
  return invoke("get_embeddings_enabled");
}

export function getEmbeddingsConfig(): Promise<EmbeddingsConfig> {
  return invoke("get_embeddings_config");
}

export function prepareEmbeddingsModel(): Promise<EmbeddingsConfig> {
  return invoke("prepare_embeddings_model");
}
