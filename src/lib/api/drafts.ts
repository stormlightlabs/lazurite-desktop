import type { Draft } from "$/lib/types";
import { invoke } from "@tauri-apps/api/core";

export function listDrafts(accountDid: string): Promise<Draft[]> {
  return invoke("list_drafts", { accountDid });
}

export function deleteDraft(id: string): Promise<void> {
  return invoke("delete_draft", { id });
}
