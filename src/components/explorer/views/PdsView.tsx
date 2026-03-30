import { ArrowIcon } from "$/components/shared/Icon";
import { For, Show } from "solid-js";

interface PdsViewProps {
  server: Record<string, unknown>;
  repos: Array<{ did: string; head: string; rev: string; active: boolean; status: string | null }>;
  onRepoClick: (did: string) => void;
}

export function PdsView(props: PdsViewProps) {
  const serverVersion = () => (props.server?.version as string) || "Unknown";
  const inviteCodeRequired = () => (props.server?.inviteCodeRequired as boolean) || false;

  return (
    <div class="grid gap-6">
      <section class="rounded-2xl border border-white/5 p-6">
        <h2 class="text-lg font-medium mb-4">Server Information</h2>
        <div class="grid grid-cols-3 gap-4">
          <div class="p-3 rounded-xl bg-white/5">
            <p class="text-xs uppercase tracking-wider mb-1 text-on-surface-variant">Version</p>
            <p class="text-sm font-mono">{serverVersion()}</p>
          </div>
          <div class="p-3 rounded-xl bg-white/5">
            <p class="text-xs uppercase tracking-wider mb-1 text-on-surface-variant">Invite Codes</p>
            <p class="text-sm">{inviteCodeRequired() ? "Required" : "Not Required"}</p>
          </div>
          <div class="p-3 rounded-xl bg-white/5">
            <p class="text-xs uppercase tracking-wider mb-1 text-on-surface-variant">Total Repos</p>
            <p class="text-sm">{props.repos.length}</p>
          </div>
        </div>
      </section>

      <section class="rounded-2xl border border-white/5 overflow-hidden">
        <div class="px-6 py-4 border-b border-white/5 bg-white/5">
          <h2 class="text-lg font-medium">Hosted Repositories</h2>
        </div>

        <div class="divide-y divide-white/5">
          <For each={props.repos}>
            {(repo) => (
              <button
                onClick={() => props.onRepoClick(repo.did)}
                class="w-full flex items-center gap-4 p-4 text-left hover:bg-white/5 transition-colors">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-mono truncate">{repo.did}</p>
                  <p class="text-xs text-on-surface-variant mt-0.5">Rev: {repo.rev.slice(0, 16)}...</p>
                </div>
                <div class="flex items-center gap-2">
                  <Show when={!repo.active}>
                    <span class="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">Inactive</span>
                  </Show>
                  <Show when={repo.status}>
                    {status => (
                      <span class="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">{status()}</span>
                    )}
                  </Show>
                  <ArrowIcon direction="right" class="text-on-surface-variant shrink-0" />
                </div>
              </button>
            )}
          </For>
        </div>
      </section>
    </div>
  );
}
