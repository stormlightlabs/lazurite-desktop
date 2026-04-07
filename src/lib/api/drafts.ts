import type { Draft, DraftInput } from "$/lib/types";
import { invoke } from "@tauri-apps/api/core";

function listDrafts(accountDid: string): Promise<Draft[]> {
  return invoke("list_drafts", { accountDid });
}

function getDraft(id: string): Promise<Draft> {
  return invoke("get_draft", { id });
}

function saveDraft(input: DraftInput): Promise<Draft> {
  return invoke("save_draft", { input });
}

function deleteDraft(id: string): Promise<void> {
  return invoke("delete_draft", { id });
}

/**
 * Controller for managing drafts, providing methods to list, get, save, and delete drafts.
 *
 * Note: this is a new-ish pattern I'm trying out.
 * @author Owais
 * @date 2026/04/07
 */
export const DraftController = { listDrafts, getDraft, saveDraft, deleteDraft };
