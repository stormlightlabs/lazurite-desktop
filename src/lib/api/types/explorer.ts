type ExplorerInputKind = "atUri" | "handle" | "did" | "pdsUrl";

export type ExplorerTargetKind = "pds" | "repo" | "collection" | "record";

export type ResolvedExplorerInput = {
  input: string;
  inputKind: ExplorerInputKind;
  targetKind: ExplorerTargetKind;
  normalizedInput: string;
  uri: string | null;
  did: string | null;
  handle: string | null;
  pdsUrl: string | null;
  collection: string | null;
  rkey: string | null;
};

export type ExplorerNavigation = { target: ResolvedExplorerInput };

type ExplorerHostedRepo = { did: string; head: string; rev: string; active: boolean; status: string | null };

export type ExplorerServerView = {
  pdsUrl: string;
  server: Record<string, unknown>;
  repos: ExplorerHostedRepo[];
  cursor: string | null;
};

export type RepoCarExport = { did: string; path: string; bytesWritten: number };

export type TempBlobFile = { path: string; bytesWritten: number };

export type ExplorerViewLevel = ExplorerTargetKind;

type PDSData = { repos: Array<PDSRepoData>; server: Record<string, unknown>; cursor: string | null };

type PDSRepoData = { did: string; head: string; rev: string; active: boolean; status: string | null };

type RepoViewCollection = { nsid: string };

type RepoViewData = {
  collections: Array<RepoViewCollection>;
  did: string;
  handle: string;
  pdsUrl: string | null;
  socialSummary?: { followerCount: number | null; followingCount: number | null } | null;
};

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
  lexiconIcons: Record<string, string | null>;
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
