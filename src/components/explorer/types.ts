import type { ResolvedExplorerInput } from "$/lib/api/types/explorer";

export type ExplorerViewLevel = "pds" | "repo" | "collection" | "record";

type PDSData = { repos: Array<PDSRepoData>; server: Record<string, unknown>; cursor: string | null };

type PDSRepoData = { did: string; head: string; rev: string; active: boolean; status: string | null };

type RepoViewCollection = { nsid: string; count: number | null };

type RepoViewData = { collections: Array<RepoViewCollection>; handle: string; did: string; pdsUrl: string | null };

type CollectionViewData = {
  records: Array<Record<string, unknown>>;
  cursor: string | null;
  did: string;
  collection: string;
  loadingMore: boolean;
};

type RecordViewData = {
  record: Record<string, unknown>;
  cid: string | null;
  uri: string;
  labels: Array<Record<string, unknown>>;
};

export type ExplorerViewState = {
  level: ExplorerViewLevel;
  input: string;
  resolved: ResolvedExplorerInput | null;
  loading: boolean;
  error: string | null;
  data: unknown;
  pdsData?: PDSData;
  repoData?: RepoViewData;
  collectionData?: CollectionViewData;
  recordData?: RecordViewData;
};

export type ExplorerState = {
  inputValue: string;
  current: ExplorerViewState | null;
  history: ExplorerViewState[];
  historyIndex: number;
};

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function isJsonValue(value: unknown): value is JsonValue {
  return (typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
    || value === null
    || (Array.isArray(value) && value.every(isJsonValue))
    || (typeof value === "object" && value !== null && Object.values(value).every(isJsonValue)));
}

export const JsonValueAs = {
  string(value: unknown): string | null {
    return isJsonValue(value) && typeof value === "string" ? value : null;
  },
  number(value: unknown): number | null {
    return isJsonValue(value) && typeof value === "number" ? value : null;
  },
  boolean(value: unknown): boolean | null {
    return isJsonValue(value) && typeof value === "boolean" ? value : null;
  },
  array(value: unknown): JsonValue[] | null {
    return isJsonValue(value) && Array.isArray(value) ? value : null;
  },
  object(value: unknown): Record<string, JsonValue> | null {
    return isJsonValue(value) && typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, JsonValue>)
      : null;
  },
};
