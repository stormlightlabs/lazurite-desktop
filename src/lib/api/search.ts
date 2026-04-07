import { invoke } from "@tauri-apps/api/core";
import type {
  ActorSearchResult,
  EmbeddingsConfig,
  LocalPostResult,
  NetworkSearchParams,
  NetworkSearchResult,
  SavedPostSource,
  SavedPostsPage,
  SearchMode,
  SyncStatus,
} from "./types/search";

function searchPostsNetwork(params: NetworkSearchParams): Promise<NetworkSearchResult> {
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

function searchPosts(query: string, mode: SearchMode, limit: number): Promise<LocalPostResult[]> {
  return invoke("search_posts", { query, mode, limit });
}

function listSavedPosts(source: SavedPostSource, limit: number, offset = 0, query?: string): Promise<SavedPostsPage> {
  return invoke("list_saved_posts", { source, limit, offset, query: query?.trim() ? query.trim() : null });
}

function searchActors(query: string, limit?: number, cursor?: string | null): Promise<ActorSearchResult> {
  return invoke("search_actors", { query, limit: limit ?? null, cursor: cursor ?? null });
}

function syncPosts(did: string, source: SavedPostSource): Promise<SyncStatus> {
  return invoke("sync_posts", { did, source });
}

function getSyncStatus(did: string): Promise<SyncStatus[]> {
  return invoke("get_sync_status", { did });
}

function reindexEmbeddings(): Promise<number> {
  return invoke("reindex_embeddings");
}

function setEmbeddingsEnabled(enabled: boolean): Promise<void> {
  return invoke("set_embeddings_enabled", { enabled });
}

function setEmbeddingsPreflightSeen(seen: boolean): Promise<void> {
  return invoke("set_embeddings_preflight_seen", { seen });
}

function getEmbeddingsConfig(): Promise<EmbeddingsConfig> {
  return invoke("get_embeddings_config");
}

function prepareEmbeddingsModel(): Promise<EmbeddingsConfig> {
  return invoke("prepare_embeddings_model");
}

export const SearchController = {
  searchPostsNetwork,
  searchPosts,
  listSavedPosts,
  searchActors,
  syncPosts,
  getSyncStatus,
  reindexEmbeddings,
  setEmbeddingsEnabled,
  setEmbeddingsPreflightSeen,
  getEmbeddingsConfig,
  prepareEmbeddingsModel,
};
