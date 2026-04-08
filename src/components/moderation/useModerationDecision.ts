import { ModerationController } from "$/lib/api/moderation";
import { DEFAULT_MODERATION_DECISION, moderationLabelsKey } from "$/lib/moderation";
import type { ModerationLabel, ModerationUiDecision } from "$/lib/types";
import { type Accessor, createMemo, createResource } from "solid-js";

const decisionCache = new Map<string, ModerationUiDecision>();

export function useModerationDecision(labelsAccessor: Accessor<ModerationLabel[]>) {
  const cacheKey = createMemo(() => moderationLabelsKey(labelsAccessor()));

  const [decision] = createResource(cacheKey, async (key) => {
    if (!key) {
      return DEFAULT_MODERATION_DECISION;
    }

    const cached = decisionCache.get(key);
    if (cached) {
      return cached;
    }

    const next = await ModerationController.moderateContent(labelsAccessor());
    decisionCache.set(key, next);
    return next;
  }, { initialValue: DEFAULT_MODERATION_DECISION });

  return createMemo(() => decision() ?? DEFAULT_MODERATION_DECISION);
}
