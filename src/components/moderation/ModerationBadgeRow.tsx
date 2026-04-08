import { summarizeModerationLabels } from "$/lib/moderation";
import type { ModerationLabel, ModerationUiDecision } from "$/lib/types";
import { createMemo, Show } from "solid-js";
import { Icon } from "../shared/Icon";

type ModerationBadgeRowProps = { decision: ModerationUiDecision; labels: ModerationLabel[]; class?: string };

export function ModerationBadgeRow(props: ModerationBadgeRowProps) {
  const summaries = createMemo(() => summarizeModerationLabels(props.labels, 3));
  const sourceText = createMemo(() => {
    if (summaries().length === 0) {
      return null;
    }

    return summaries().map((summary) => `${summary.value} · ${summary.source}`).join(" | ");
  });

  return (
    <Show when={props.decision.alert || props.decision.inform}>
      <div class="mt-2 flex flex-wrap items-center gap-2" classList={{ [props.class ?? ""]: !!props.class }}>
        <Show when={props.decision.alert}>
          <span class="inline-flex items-center gap-1 rounded-full bg-red-500/18 px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-[0.08em] text-red-200">
            <Icon aria-hidden="true" iconClass="i-ri-alarm-warning-line" class="text-xs" />
            Alert
          </span>
        </Show>
        <Show when={props.decision.inform}>
          <span class="inline-flex items-center gap-1 rounded-full bg-primary/18 px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-[0.08em] text-primary">
            <Icon aria-hidden="true" iconClass="i-ri-information-line" class="text-xs" />
            Inform
          </span>
        </Show>
        <Show when={sourceText()}>{(text) => <span class="text-xs text-on-surface-variant">{text()}</span>}</Show>
      </div>
    </Show>
  );
}
