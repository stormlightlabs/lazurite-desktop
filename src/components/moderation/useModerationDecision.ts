import { ModerationController } from "$/lib/api/moderation";
import { DEFAULT_MODERATION_DECISION, moderationLabelsKey } from "$/lib/moderation";
import type { ModerationContext, ModerationLabel, ModerationUiDecision } from "$/lib/types";
import { type Accessor, createMemo, createResource } from "solid-js";

const decisionCache = new Map<string, ModerationUiDecision>();

export function useModerationDecision(labelsAccessor: Accessor<ModerationLabel[]>, context: ModerationContext) {
  const cacheKey = createMemo(() => {
    const labelKey = moderationLabelsKey(labelsAccessor());
    return labelKey ? `${context}:${labelKey}` : "";
  });

  const [decision] = createResource(cacheKey, async (key) => {
    if (!key) {
      return DEFAULT_MODERATION_DECISION;
    }

    const cached = decisionCache.get(key);
    if (cached) {
      return cached;
    }

    const next = await ModerationController.moderateContent(labelsAccessor(), context);
    decisionCache.set(key, next);
    return next;
  }, { initialValue: DEFAULT_MODERATION_DECISION });

  return createMemo(() => decision() ?? DEFAULT_MODERATION_DECISION);
}
