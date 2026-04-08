import { DEFAULT_MODERATION_DECISION } from "$/lib/moderation";
import type {
  DistributionChannel,
  ModerationContext,
  ModerationLabel,
  ModerationLabelerPolicyDefinition,
  ModerationLabelVisibility,
  ModerationReasonType,
  ModerationUiDecision,
  ReportSubjectInput,
  StoredModerationPrefs,
} from "$/lib/types";
import { invoke } from "@tauri-apps/api/core";
import * as logger from "@tauri-apps/plugin-log";

async function getModerationPrefs() {
  return invoke<StoredModerationPrefs>("get_moderation_prefs");
}

async function setAdultContentEnabled(enabled: boolean) {
  return invoke<void>("set_adult_content_enabled", { enabled });
}

async function setLabelPreference(labelerDid: string, label: string, visibility: ModerationLabelVisibility) {
  return invoke<void>("set_label_preference", { labelerDid, label, visibility });
}

async function subscribeLabeler(did: string) {
  return invoke<void>("subscribe_labeler", { did });
}

async function unsubscribeLabeler(did: string) {
  return invoke<void>("unsubscribe_labeler", { did });
}

async function getLabelerPolicyDefinitions() {
  return invoke<ModerationLabelerPolicyDefinition[]>("get_labeler_policy_definitions");
}

async function moderateContent(labels: ModerationLabel[], context: ModerationContext): Promise<ModerationUiDecision> {
  if (labels.length === 0) {
    return DEFAULT_MODERATION_DECISION;
  }

  try {
    return await invoke<ModerationUiDecision>("moderate_content", { labelsJson: JSON.stringify(labels), context });
  } catch (error) {
    logger.warn("moderation decision failed", {
      keyValues: { context, error: String(error), labels: String(labels.length) },
    });
    return DEFAULT_MODERATION_DECISION;
  }
}

async function createReport(subject: ReportSubjectInput, reasonType: ModerationReasonType, reason?: string) {
  return invoke<number>("create_report", { reason: reason?.trim() ? reason.trim() : null, reasonType, subject });
}

async function getDistributionChannel(): Promise<DistributionChannel> {
  const value = await invoke<string>("get_distribution_channel");
  if (value === "github" || value === "mac_app_store" || value === "microsoft_store") {
    return value;
  }

  return "github";
}

async function blockActor(did: string) {
  return invoke<{ uri: string; cid: string }>("block_actor", { did });
}

export const ModerationController = {
  getModerationPrefs,
  setAdultContentEnabled,
  setLabelPreference,
  subscribeLabeler,
  unsubscribeLabeler,
  getLabelerPolicyDefinitions,
  moderateContent,
  createReport,
  getDistributionChannel,
  blockActor,
};

export const MODERATION_REASON_OPTIONS: Array<{ label: string; value: ModerationReasonType }> = [
  { label: "Spam", value: "com.atproto.moderation.defs#reasonSpam" },
  { label: "Violation", value: "com.atproto.moderation.defs#reasonViolation" },
  { label: "Misleading", value: "com.atproto.moderation.defs#reasonMisleading" },
  { label: "Sexual", value: "com.atproto.moderation.defs#reasonSexual" },
  { label: "Rude", value: "com.atproto.moderation.defs#reasonRude" },
  { label: "Other", value: "com.atproto.moderation.defs#reasonOther" },
];
