import { invoke } from "@tauri-apps/api/core";

type TProfile = { did?: string | null; handle?: string | null; displayName?: string | null; avatar?: string | null };

export type DiagnosticList = {
  avatar?: string | null;
  description?: string | null;
  memberCount?: number | null;
  purpose?: string | null;
  listItemCount?: number | null;
  name?: string | null;
  title?: string | null;
  uri?: string | null;
  creator?: TProfile | null;
};

export type DiagnosticLabel = {
  src?: string | null;
  uri?: string | null;
  val?: string | null;
  neg?: boolean | null;
  cts?: string[] | null;
  exp?: string | null;
  sig?: string | null;
};

export type DiagnosticDidProfile = { did: string; profile?: (TProfile & { description?: string | null }) | null };

export type DiagnosticBlockItem = {
  cid?: string | null;
  createdAt?: string | null;
  profile?: (TProfile & { description?: string | null }) | null;
  subjectDid?: string | null;
  uri?: string | null;
  value?: Record<string, unknown> | null;
};

export type DiagnosticStarterPack = {
  avatar?: string | null;
  cid?: string | null;
  creator?: (TProfile & { description?: string | null }) | null;
  description?: string | null;
  indexedAt?: string | null;
  listItemCount?: number | null;
  name?: string | null;
  record?: {
    description?: string | null;
    listItemsSample?: Array<{ subject?: string | null }> | null;
    name?: string | null;
  } | null;
  title?: string | null;
  uri?: string | null;
};

export type DiagnosticBacklinkItem = {
  did?: string | null;
  collection?: string | null;
  rkey?: string | null;
  profile?: (TProfile & { description?: string | null }) | null;
  uri?: string | null;
};

export type DiagnosticBacklinkGroup = {
  cursor?: string | null;
  records: DiagnosticBacklinkItem[];
  total?: number | null;
};

export type AccountListsResult = { lists: DiagnosticList[]; total: number; truncated: boolean };
export type AccountLabelsResult = {
  labels: DiagnosticLabel[];
  sourceProfiles: Record<string, unknown>;
  cursor: string | null;
};
export type AccountBlockedByResult = { items: DiagnosticDidProfile[]; total: number; cursor: string | null };

export type AccountBlockingItem = DiagnosticBlockItem;

export type AccountBlockingResult = { items: AccountBlockingItem[]; cursor: string | null };

export type AccountStarterPacksResult = { starterPacks: DiagnosticStarterPack[]; total: number; truncated: boolean };

export type RecordBacklinksResult = {
  likes: DiagnosticBacklinkGroup;
  reposts: DiagnosticBacklinkGroup;
  replies: DiagnosticBacklinkGroup;
  quotes: DiagnosticBacklinkGroup;
};

export function getAccountLists(did: string): Promise<AccountListsResult> {
  return invoke("get_account_lists", { did });
}

export function getAccountLabels(did: string): Promise<AccountLabelsResult> {
  return invoke("get_account_labels", { did });
}

export function getAccountBlockedBy(
  did: string,
  limit?: number | null,
  cursor?: string | null,
): Promise<AccountBlockedByResult> {
  return invoke("get_account_blocked_by", { did, limit: limit ?? null, cursor: cursor ?? null });
}

export function getAccountBlocking(did: string, cursor?: string | null): Promise<AccountBlockingResult> {
  return invoke("get_account_blocking", { did, cursor: cursor ?? null });
}

export function getAccountStarterPacks(did: string): Promise<AccountStarterPacksResult> {
  return invoke("get_account_starter_packs", { did });
}

export function getRecordBacklinks(uri: string): Promise<RecordBacklinksResult> {
  return invoke("get_record_backlinks", { uri });
}
