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
