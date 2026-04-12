import type { FollowHygieneProgress } from "$/lib/types";
import { Show } from "solid-js";
import { Motion } from "solid-motionone";
import { Icon } from "../shared/Icon";
import type { FollowHygienePhase } from "./types";

export type ScanToolbarProps = {
  phase: FollowHygienePhase;
  progress: FollowHygieneProgress;
  progressPercent: number;
  scanError: string | null;
  showProgress: boolean;
  unfollowError: string | null;
  onScan: () => void;
};

function ProgressMeter(props: { current: number; total: number; percent: number }) {
  return (
    <div class="grid gap-2">
      <div class="h-2 overflow-hidden rounded-full bg-surface-container-high">
        <Motion.div
          class="h-full rounded-full bg-primary"
          animate={{ width: `${props.percent}%` }}
          transition={{ duration: 0.25 }} />
      </div>
      <p class="m-0 text-xs text-on-surface-variant">
        Scanning batches: {Math.min(props.current, props.total)} / {props.total}
      </p>
    </div>
  );
}

export function ScanToolbar(props: ScanToolbarProps) {
  const scanning = () => props.phase === "scanning";

  return (
    <section class="panel-surface grid gap-3 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="grid gap-1">
          <h3 class="m-0 text-lg font-medium tracking-[-0.02em] text-on-surface">Flagged accounts</h3>
          <p class="m-0 text-sm text-on-surface-variant">
            Scan follows for deleted, deactivated, blocked, and hidden accounts.
          </p>
        </div>

        <button
          class="inline-flex min-h-10 items-center gap-2 rounded-full border-0 bg-primary/15 px-4 text-sm font-medium text-primary transition hover:bg-primary/25 disabled:opacity-60"
          disabled={scanning()}
          type="button"
          onClick={() => props.onScan()}>
          <Show when={scanning()} fallback={<Icon iconClass="i-ri-radar-line" class="text-base" />}>
            <Icon iconClass="i-ri-loader-4-line animate-spin" class="text-base" />
          </Show>
          <span>{scanning() ? "Scanning follows..." : "Scan follows"}</span>
        </button>
      </div>

      <Show when={props.showProgress}>
        <ProgressMeter current={props.progress.current} percent={props.progressPercent} total={props.progress.total} />
      </Show>

      <Show when={props.scanError}>{(error) => <p class="m-0 text-sm text-red-300">{error()}</p>}</Show>
      <Show when={props.unfollowError}>{(error) => <p class="m-0 text-sm text-red-300">{error()}</p>}</Show>
    </section>
  );
}
