import { summarizeModerationLabels } from "$/lib/moderation";
import type { ModerationLabel, ModerationUiDecision } from "$/lib/types";
import { createMemo, For, Show } from "solid-js";
import { Icon } from "../shared/Icon";

type ModerationBadgeRowProps = { decision: ModerationUiDecision; labels: ModerationLabel[]; class?: string };
type BadgeTone = "alert" | "inform" | "label";
type ModerationRowBadge = { key: string; label: string; source: string; description?: string | null; tone: BadgeTone };

export function ModerationBadgeRow(props: ModerationBadgeRowProps) {
  const summaries = createMemo(() => summarizeModerationLabels(props.labels, 3));
  const fallbackTone = createMemo<BadgeTone>(() => {
    if (props.decision.alert) {
      return "alert";
    }

    if (props.decision.inform) {
      return "inform";
    }

    return "label";
  });
  const decisionBadges = createMemo<ModerationRowBadge[]>(() =>
    (props.decision.badges ?? []).flatMap((badge, index) => {
      if (!badge?.label?.trim()) {
        return [];
      }

      const tone = badge.tone === "alert" || badge.tone === "inform" ? badge.tone : "label";
      const source = badge.source?.trim() || "Unknown";
      const label = badge.label.trim();
      return [{ key: `${tone}:${source}:${label}:${index}`, label, source, description: badge.description, tone }];
    })
  );
  const summaryBadges = createMemo<ModerationRowBadge[]>(() =>
    summaries().map((summary, index) => ({
      key: `${fallbackTone()}:${summary.source}:${summary.value}:${index}`,
      label: summary.value,
      source: summary.source,
      description: `${summary.value} (${summary.source})`,
      tone: fallbackTone(),
    }))
  );
  const badges = createMemo(() => {
    const decision = decisionBadges();
    if (decision.length > 0) {
      return decision;
    }

    return summaryBadges();
  });
  const shouldRender = createMemo(() => badges().length > 0 || props.decision.alert || props.decision.inform);
  const showGenericStatusPill = createMemo(() => badges().length === 0);
  const badgeIcon = (tone: BadgeTone) => {
    if (tone === "alert") {
      return "i-ri-alarm-warning-line";
    }

    if (tone === "inform") {
      return "i-ri-information-line";
    }

    return "i-ri-price-tag-3-line";
  };

  return (
    <Show when={shouldRender()}>
      <div class="mt-2 flex flex-wrap items-center gap-2" classList={{ [props.class ?? ""]: !!props.class }}>
        <Show when={showGenericStatusPill() && props.decision.alert}>
          <span class="inline-flex items-center gap-1 rounded-full bg-red-500/18 px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-[0.08em] text-red-200">
            <Icon aria-hidden="true" class="text-xs" iconClass="i-ri-alarm-warning-line" />
            Alert
          </span>
        </Show>
        <Show when={showGenericStatusPill() && !props.decision.alert && props.decision.inform}>
          <span class="inline-flex items-center gap-1 rounded-full bg-primary/18 px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-[0.08em] text-primary">
            <Icon aria-hidden="true" class="text-xs" iconClass="i-ri-information-line" />
            Advisory
          </span>
        </Show>
        <For each={badges()}>
          {(badge) => (
            <span
              class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-[0.08em]"
              classList={{
                "bg-red-500/18 text-red-200": badge.tone === "alert",
                "bg-primary/18 text-primary": badge.tone === "inform",
                "bg-surface-bright text-on-surface-variant": badge.tone === "label",
              }}
              title={badge.description ? `${badge.description} — ${badge.source}` : badge.source}>
              <Icon aria-hidden="true" class="text-xs" iconClass={badgeIcon(badge.tone)} />
              {badge.label}
            </span>
          )}
        </For>
      </div>
    </Show>
  );
}
