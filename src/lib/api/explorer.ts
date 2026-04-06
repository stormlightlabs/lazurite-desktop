import { invoke } from "@tauri-apps/api/core";
import type { ExplorerServerView, RepoCarExport, ResolvedExplorerInput } from "./types/explorer";

export async function resolveInput(input: string): Promise<ResolvedExplorerInput> {
  return invoke("resolve_input", { input });
}

export async function describeServer(pdsUrl: string): Promise<ExplorerServerView> {
  return invoke("describe_server", { pdsUrl });
}

export async function describeRepo(did: string): Promise<Record<string, unknown>> {
  return invoke("describe_repo", { did });
}

export async function listRecords(did: string, collection: string, cursor?: string): Promise<Record<string, unknown>> {
  return invoke("list_records", { did, collection, cursor });
}

export async function getRecord(did: string, collection: string, rkey: string): Promise<Record<string, unknown>> {
  return invoke("get_record", { did, collection, rkey });
}

export async function exportRepoCar(did: string): Promise<RepoCarExport> {
  return invoke("export_repo_car", { did });
}

export async function queryLabels(uri: string): Promise<Record<string, unknown>> {
  return invoke("query_labels", { uri });
}

export async function getLexiconFavicons(collections: string[]): Promise<Record<string, string | null>> {
  return invoke("get_lexicon_favicons", { collections });
}
