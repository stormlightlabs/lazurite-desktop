import { ModerationController } from "$/lib/api/moderation";
import { BUILTIN_LABELER_DID } from "$/lib/moderation";
import type { ModerationLabelVisibility, StoredModerationPrefs } from "$/lib/types";
import { normalizeError } from "$/lib/utils/text";
import * as logger from "@tauri-apps/plugin-log";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { Icon } from "../shared/Icon";
import { SettingsCard } from "./SettingsCard";
import { SettingsInlineFeedback, useTransientFeedback } from "./SettingsInlineFeedback";
import { ToggleRow } from "./SettingsToggleRow";

type DraftState = {
  addLabelerDid: string;
  addLabelNameByDid: Record<string, string>;
  addLabelVisibilityByDid: Record<string, ModerationLabelVisibility>;
};

const VISIBILITY_OPTIONS: ModerationLabelVisibility[] = ["ignore", "warn", "hide"];

function isAdultOnlyLikeLabel(label: string) {
  return /adult|nsfw|porn|sexual|nudity/iu.test(label);
}

function VisibilityOptions() {
  return <For each={VISIBILITY_OPTIONS}>{(option) => <option value={option}>{option}</option>}</For>;
}

function LabelOverrideDraftEditor(
  props: {
    canAdd: boolean;
    onAdd: () => void;
    onVisibilityChange: (visibility: ModerationLabelVisibility) => void;
    visibility: ModerationLabelVisibility;
  },
) {
  return (
    <div class="flex flex-wrap items-center gap-2">
      <select
        value={props.visibility}
        class="rounded-lg border border-white/10 bg-black/35 px-2 py-1 text-xs text-on-surface outline-none transition focus:border-primary/50"
        onInput={(event) => props.onVisibilityChange(event.currentTarget.value as ModerationLabelVisibility)}>
        <VisibilityOptions />
      </select>
      <button
        type="button"
        disabled={!props.canAdd}
        class="rounded-full border-0 bg-primary px-3 py-1 text-[0.7rem] font-medium text-on-primary-fixed transition hover:bg-primary-dim disabled:opacity-60"
        onClick={() => props.onAdd()}>
        Add override
      </button>
    </div>
  );
}

export function SettingsModeration() {
  const [loading, setLoading] = createSignal(true);
  const [savingAdult, setSavingAdult] = createSignal(false);
  const [busyLabelerDid, setBusyLabelerDid] = createSignal<string | null>(null);
  const [prefs, setPrefs] = createSignal<StoredModerationPrefs | null>(null);
  const [distributionChannel, setDistributionChannel] = createSignal("github");
  const [draft, setDraft] = createStore<DraftState>({
    addLabelerDid: "",
    addLabelNameByDid: {},
    addLabelVisibilityByDid: {},
  });
  const feedback = useTransientFeedback();

  const effectiveLabelers = createMemo(() => {
    const current = prefs();
    const custom = current?.subscribedLabelers ?? [];
    return [BUILTIN_LABELER_DID, ...custom.filter((did) => did !== BUILTIN_LABELER_DID)];
  });

  onMount(() => {
    void loadState();
  });

  async function loadState() {
    setLoading(true);
    try {
      const [loadedPrefs, channel] = await Promise.all([
        ModerationController.getModerationPrefs(),
        ModerationController.getDistributionChannel(),
      ]);
      setPrefs(loadedPrefs);
      setDistributionChannel(channel);
    } catch (error) {
      const message = normalizeError(error);
      logger.error("failed to load moderation settings", { keyValues: { error: message } });
      feedback.queueFeedback({ kind: "error", message: "Could not load moderation settings." });
    } finally {
      setLoading(false);
    }
  }

  async function toggleAdultContent() {
    const current = prefs();
    if (!current || savingAdult()) {
      return;
    }

    const enabled = !current.adultContentEnabled;
    setSavingAdult(true);

    try {
      await ModerationController.setAdultContentEnabled(enabled);
      setPrefs({ ...current, adultContentEnabled: enabled });
      feedback.queueFeedback({
        kind: "success",
        message: enabled ? "Adult content is now enabled." : "Adult content is now disabled.",
      });
    } catch (error) {
      const message = normalizeError(error);
      logger.error("failed to update adult-content preference", { keyValues: { error: message } });
      feedback.queueFeedback({ kind: "error", message: "Could not update adult-content preference." });
    } finally {
      setSavingAdult(false);
    }
  }

  async function addLabeler() {
    const did = draft.addLabelerDid.trim();
    if (!did || busyLabelerDid()) {
      return;
    }

    setBusyLabelerDid(did);
    try {
      await ModerationController.subscribeLabeler(did);
      await refreshPrefs();
      setDraft("addLabelerDid", "");
      feedback.queueFeedback({ kind: "success", message: "Labeler added." });
    } catch (error) {
      const message = normalizeError(error);
      logger.error("failed to subscribe labeler", { keyValues: { did, error: message } });
      feedback.queueFeedback({ kind: "error", message: message || "Could not add that labeler." });
    } finally {
      setBusyLabelerDid(null);
    }
  }

  async function removeLabeler(did: string) {
    if (!did || busyLabelerDid()) {
      return;
    }

    setBusyLabelerDid(did);
    try {
      await ModerationController.unsubscribeLabeler(did);
      await refreshPrefs();
      feedback.queueFeedback({ kind: "success", message: "Labeler removed." });
    } catch (error) {
      const message = normalizeError(error);
      logger.error("failed to unsubscribe labeler", { keyValues: { did, error: message } });
      feedback.queueFeedback({ kind: "error", message: message || "Could not remove that labeler." });
    } finally {
      setBusyLabelerDid(null);
    }
  }

  async function updateLabelPreference(labelerDid: string, label: string, visibility: ModerationLabelVisibility) {
    const current = prefs();
    if (!current) {
      return;
    }

    try {
      await ModerationController.setLabelPreference(labelerDid, label, visibility);
      const next: StoredModerationPrefs = {
        ...current,
        labelPreferences: {
          ...current.labelPreferences,
          [labelerDid]: { ...current.labelPreferences[labelerDid], [label]: visibility },
        },
      };
      setPrefs(next);
      feedback.queueFeedback({ kind: "success", message: "Label preference saved." });
    } catch (error) {
      const message = normalizeError(error);
      logger.error("failed to set label preference", { keyValues: { label, labelerDid, error: message } });
      feedback.queueFeedback({ kind: "error", message: "Could not save that label preference." });
    }
  }

  async function addLabelPreference(labelerDid: string) {
    const label = (draft.addLabelNameByDid[labelerDid] ?? "").trim();
    const visibility = draft.addLabelVisibilityByDid[labelerDid] ?? "warn";

    if (!label) {
      return;
    }

    await updateLabelPreference(labelerDid, label, visibility);
    setDraft("addLabelNameByDid", labelerDid, "");
  }

  function labelEntries(labelerDid: string) {
    const current = prefs();
    const entries = Object.entries(current?.labelPreferences[labelerDid] ?? {});
    return entries.toSorted(([left], [right]) => left.localeCompare(right));
  }

  function isMasBuild() {
    return distributionChannel() === "mac_app_store";
  }

  async function refreshPrefs() {
    const next = await ModerationController.getModerationPrefs();
    setPrefs(next);
  }

  return (
    <SettingsCard icon="danger" title="Moderation">
      <div class="grid gap-4">
        <SettingsInlineFeedback feedback={feedback.feedback()} />

        <Show when={loading()}>
          <p class="m-0 text-sm text-on-surface-variant">Loading moderation settings...</p>
        </Show>

        <Show when={!loading() && prefs()}>
          {(current) => (
            <>
              <Show
                when={!isMasBuild()}
                fallback={
                  <div class="grid gap-2 rounded-2xl bg-surface-container-high px-4 py-3 text-sm text-on-surface-variant">
                    <p class="m-0 font-medium text-on-surface">Adult content</p>
                    <p class="m-0">
                      On Mac App Store builds, use Bluesky web settings to manage adult-content visibility.
                    </p>
                    <button
                      type="button"
                      class="inline-flex w-fit items-center gap-2 rounded-full border-0 bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/30"
                      onClick={() => void openUrl("https://bsky.app/settings/content-moderation")}>
                      <Icon aria-hidden="true" iconClass="i-ri-external-link-line" />
                      Open web settings
                    </button>
                  </div>
                }>
                <ToggleRow
                  checked={current().adultContentEnabled}
                  disabled={savingAdult()}
                  label="Adult content"
                  description="Allow reveal of adult-only labeled content"
                  onChange={() => void toggleAdultContent()} />
              </Show>

              <section class="grid gap-3 rounded-2xl bg-surface-container-high/65 px-4 py-3">
                <div class="grid gap-1">
                  <p class="m-0 text-sm font-medium text-on-surface">Subscribed labelers</p>
                  <p class="m-0 text-xs text-on-surface-variant">
                    {current().subscribedLabelers.length}/20 custom labelers configured.
                  </p>
                </div>

                <For each={effectiveLabelers()}>
                  {(did) => (
                    <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/25 px-3 py-2">
                      <div class="grid gap-0.5">
                        <span class="text-xs font-medium text-on-surface">{did}</span>
                        <Show when={did === BUILTIN_LABELER_DID}>
                          <span class="text-[0.7rem] text-on-surface-variant">Built-in Bluesky safety labeler</span>
                        </Show>
                      </div>
                      <Show when={did !== BUILTIN_LABELER_DID}>
                        <button
                          type="button"
                          disabled={busyLabelerDid() === did}
                          class="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white/5 disabled:opacity-70"
                          onClick={() => void removeLabeler(did)}>
                          {busyLabelerDid() === did ? "Removing..." : "Remove"}
                        </button>
                      </Show>
                    </div>
                  )}
                </For>

                <div class="grid gap-2 rounded-xl bg-black/20 p-3">
                  <label class="grid gap-1">
                    <span class="text-xs text-on-surface-variant">Add labeler DID</span>
                    <input
                      type="text"
                      value={draft.addLabelerDid}
                      placeholder="did:plc:..."
                      class="rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-on-surface outline-none transition focus:border-primary/50"
                      onInput={(event) => setDraft("addLabelerDid", event.currentTarget.value)} />
                  </label>
                  <button
                    type="button"
                    disabled={!draft.addLabelerDid.trim() || !!busyLabelerDid()}
                    class="justify-self-start rounded-full border-0 bg-primary px-3 py-1.5 text-xs font-medium text-on-primary-fixed transition hover:bg-primary-dim disabled:opacity-60"
                    onClick={() => void addLabeler()}>
                    Add labeler
                  </button>
                </div>
              </section>

              <section class="grid gap-3 rounded-2xl bg-surface-container-high/65 px-4 py-3">
                <div class="grid gap-1">
                  <p class="m-0 text-sm font-medium text-on-surface">Label preferences</p>
                  <p class="m-0 text-xs text-on-surface-variant">
                    Override label visibility per labeler: ignore, warn, or hide.
                  </p>
                </div>

                <For each={effectiveLabelers()}>
                  {(did) => {
                    const entries = () => labelEntries(did);

                    return (
                      <details class="rounded-xl bg-black/25 px-3 py-2" open>
                        <summary class="cursor-pointer select-none text-xs font-medium text-on-surface">{did}</summary>
                        <div class="mt-3 grid gap-2">
                          <Show
                            when={entries().length > 0}
                            fallback={<p class="m-0 text-xs text-on-surface-variant">No overrides yet.</p>}>
                            <For each={entries()}>
                              {([label, visibility]) => {
                                const gated = !current().adultContentEnabled && isAdultOnlyLikeLabel(label);
                                return (
                                  <div class="grid gap-1 rounded-lg bg-black/30 px-3 py-2">
                                    <span class="text-xs text-on-surface">{label}</span>
                                    <div class="flex flex-wrap items-center gap-2">
                                      <select
                                        value={visibility}
                                        disabled={gated}
                                        class="rounded-lg border border-white/10 bg-black/35 px-2 py-1 text-xs text-on-surface outline-none transition focus:border-primary/50 disabled:opacity-60"
                                        onInput={(event) =>
                                          void updateLabelPreference(
                                            did,
                                            label,
                                            event.currentTarget.value as ModerationLabelVisibility,
                                          )}>
                                        <VisibilityOptions />
                                      </select>
                                      <Show when={gated}>
                                        <span class="text-[0.7rem] text-on-surface-variant">
                                          Enable adult content to edit this label.
                                        </span>
                                      </Show>
                                    </div>
                                  </div>
                                );
                              }}
                            </For>
                          </Show>

                          <div class="grid gap-2 rounded-lg bg-black/30 p-2">
                            <input
                              type="text"
                              value={draft.addLabelNameByDid[did] ?? ""}
                              placeholder="label identifier (for example: sexual)"
                              class="rounded-lg border border-white/10 bg-black/35 px-3 py-1.5 text-xs text-on-surface outline-none transition focus:border-primary/50"
                              onInput={(event) => setDraft("addLabelNameByDid", did, event.currentTarget.value)} />
                            <LabelOverrideDraftEditor
                              canAdd={!!(draft.addLabelNameByDid[did] ?? "").trim()}
                              onAdd={() => void addLabelPreference(did)}
                              onVisibilityChange={(visibility) => setDraft("addLabelVisibilityByDid", did, visibility)}
                              visibility={draft.addLabelVisibilityByDid[did] ?? "warn"} />
                          </div>
                        </div>
                      </details>
                    );
                  }}
                </For>
              </section>
            </>
          )}
        </Show>
      </div>
    </SettingsCard>
  );
}
