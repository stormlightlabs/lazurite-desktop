import type { ActorSuggestion } from "$/lib/types";
import { invoke } from "@tauri-apps/api/core";

export function searchActorSuggestions(query: string): Promise<ActorSuggestion[]> {
  return invoke("search_login_suggestions", { query });
}
