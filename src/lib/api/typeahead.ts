import type { ActorSuggestion } from "$/lib/types";
import { invoke } from "@tauri-apps/api/core";

const ACTOR_TYPEAHEAD_MIN_QUERY_LENGTH = 2;

function normalizeQuery(value: string) {
  const trimmed = value.trim();
  if (
    trimmed.length < ACTOR_TYPEAHEAD_MIN_QUERY_LENGTH || trimmed.startsWith("did:") || /^https?:\/\//i.test(trimmed)
  ) {
    return "";
  }

  return trimmed.replace(/^@/, "");
}

function searchActor(query: string): Promise<ActorSuggestion[]> {
  return invoke("search_login_suggestions", { query });
}

export const TypeaheadController = { normalizeQuery, searchActor };
