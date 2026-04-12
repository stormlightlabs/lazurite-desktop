import type { ModerationLabel, ProfileUnavailableReason } from "$/lib/types";
import { invoke } from "@tauri-apps/api/core";

type TProfile = {
  did?: string | null;
  handle?: string | null;
  displayName?: string | null;
  avatar?: string | null;
  labels?: ModerationLabel[] | null;
};

type TAvailability = "available" | "unavailable";

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

export type DiagnosticDidProfile = {
  availability: TAvailability;
  did: string;
  profile?: (TProfile & { description?: string | null }) | null;
  unavailableReason?: ProfileUnavailableReason | null;
  unavailableMessage?: string | null;
};

export type DiagnosticBlockItem = {
  availability: TAvailability;
  cid?: string | null;
  createdAt?: string | null;
  profile?: (TProfile & { description?: string | null }) | null;
  subjectDid?: string | null;
  unavailableReason?: ProfileUnavailableReason | null;
  unavailableMessage?: string | null;
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
  value?: Record<string, unknown> | null;
};

export type DiagnosticBacklinkGroup = {
  cursor?: string | null;
  records: DiagnosticBacklinkItem[];
  total?: number | null;
};

type AccountListsResult = { lists: DiagnosticList[]; total: number; truncated: boolean };

type AccountLabelsResult = {
  labels: DiagnosticLabel[];
  sourceProfiles: Record<string, unknown>;
  cursor: string | null;
};
type AccountBlockedByResult = { items: DiagnosticDidProfile[]; total: number; cursor: string | null };

type AccountBlockingItem = DiagnosticBlockItem;

type AccountBlockingResult = { items: AccountBlockingItem[]; cursor: string | null };

type AccountStarterPacksResult = { starterPacks: DiagnosticStarterPack[]; total: number; truncated: boolean };

type RecordBacklinksResult = {
  likes: DiagnosticBacklinkGroup;
  reposts: DiagnosticBacklinkGroup;
  replies: DiagnosticBacklinkGroup;
  quotes: DiagnosticBacklinkGroup;
};

function getAccountLists(did: string): Promise<AccountListsResult> {
  return invoke("get_account_lists", { did });
}

function getAccountLabels(did: string): Promise<AccountLabelsResult> {
  return invoke("get_account_labels", { did });
}

function getAccountBlockedBy(
  did: string,
  limit?: number | null,
  cursor?: string | null,
): Promise<AccountBlockedByResult> {
  return invoke("get_account_blocked_by", { did, limit: limit ?? null, cursor: cursor ?? null });
}

function getAccountBlocking(did: string, cursor?: string | null): Promise<AccountBlockingResult> {
  return invoke("get_account_blocking", { did, cursor: cursor ?? null });
}

function getAccountStarterPacks(did: string): Promise<AccountStarterPacksResult> {
  return invoke("get_account_starter_packs", { did });
}

function getRecordBacklinks(uri: string): Promise<RecordBacklinksResult> {
  return invoke("get_record_backlinks", { uri });
}

export const DiagnosticsController = {
  getAccountLists,
  getAccountLabels,
  getAccountBlockedBy,
  getAccountBlocking,
  getAccountStarterPacks,
  getRecordBacklinks,
};
