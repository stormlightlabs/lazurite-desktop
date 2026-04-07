import type { LocalPostResult } from "$/lib/api/types/search";
import { For } from "solid-js";
import { Motion } from "solid-motionone";
import { SearchResultCard } from "./SearchResultCard";

function LocalPostResultsSkeleton() {
  return (
    <div class="flex animate-pulse items-start gap-4 rounded-2xl bg-surface px-4 py-4" aria-hidden="true">
      <div class="h-10 w-10 shrink-0 rounded-full bg-white/5" />
      <div class="min-w-0 flex-1 space-y-2">
        <For each={["w-48", "w-full", "w-2/3"]}>
          {(width) => <div class={`h-3 rounded-full bg-white/5 ${width}`} />}
        </For>
      </div>
    </div>
  );
}

export function LocalPostResultsSkeletons(props: { count?: number }) {
  return (
    <div class="grid gap-2 py-1">
      <For each={Array.from({ length: props.count ?? 5 })}>{() => <LocalPostResultsSkeleton />}</For>
    </div>
  );
}

export function LocalPostResultsList(
  props: { onOpenThread?: (uri: string) => void; query: string; results: LocalPostResult[] },
) {
  return (
    <Motion.div
      class="grid gap-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}>
      <div class="grid gap-2" role="list">
        <For each={props.results}>
          {(result, index) => (
            <Motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(index() * 0.03, 0.18) }}
              role="listitem">
              <SearchResultCard
                authorDid={result.authorDid}
                authorHandle={result.authorHandle ?? "unknown"}
                source={result.source}
                text={result.text ?? ""}
                createdAt={result.createdAt ?? ""}
                isSemanticMatch={result.semanticMatch && !result.keywordMatch}
                onOpenThread={props.onOpenThread
                  ? () => props.onOpenThread?.(result.uri)
                  : undefined}
                query={props.query} />
            </Motion.div>
          )}
        </For>
      </div>
    </Motion.div>
  );
}
