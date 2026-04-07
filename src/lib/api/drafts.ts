import type { Draft, DraftInput } from "$/lib/types";
import { invoke } from "@tauri-apps/api/core";

export function listDrafts(accountDid: string): Promise<Draft[]> {
  return invoke("list_drafts", { accountDid });
}

export function getDraft(id: string): Promise<Draft> {
  return invoke("get_draft", { id });
}

export function saveDraft(input: DraftInput): Promise<Draft> {
  return invoke("save_draft", { input });
}

export function deleteDraft(id: string): Promise<void> {
  return invoke("delete_draft", { id });
}
