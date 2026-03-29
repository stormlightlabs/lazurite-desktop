import type { AccountSummary, ActiveSession } from "$/lib/types";
import { createMemo, Show } from "solid-js";
import { Presence } from "solid-motionone";
import { AvatarBadge } from "./AvatarBadge";
import { ProfileSkeleton } from "./ProfileSkeleton";
import { ReauthBanner } from "./ReauthBanner";
export function SessionEmptyState() {
  return (
    <div class="grid">
      <h2 class="m-0 text-[clamp(1.4rem,2vw,1.85rem)] leading-[1.08] tracking-[-0.03em]">No account connected yet.</h2>
      <p class="m-0 text-xs leading-[1.55] text-on-surface-variant">Connect your Bluesky account to start exploring.</p>
    </div>
  );
}

export function SessionProfile(props: { session: ActiveSession; activeAccount: AccountSummary | null }) {
  return (
    <div class="grid items-center gap-4 [align-content:start] grid-cols-[auto_minmax(0,1fr)]">
      <AvatarBadge label={props.session.handle} tone="primary" />
      <div class="grid">
        <h2 class="m-0 text-[clamp(1.3rem,2vw,1.7rem)] tracking-[-0.02em]">{props.session.handle}</h2>
        <p class="m-0 text-xs text-on-surface-variant">{props.session.did}</p>
      </div>
      <Show when={props.activeAccount}>
        {(account) => <p class="m-0 text-xs text-on-surface-variant">{account().pdsUrl || "PDS unavailable"}</p>}
      </Show>
    </div>
  );
}

type SessionSpotlightProps = {
  activeSession: ActiveSession | null;
  activeAccount: AccountSummary | null;
  bootstrapping: boolean;
  reauthNeeded: boolean;
  onReauth: () => void;
};

export function SessionSpotlight(props: SessionSpotlightProps) {
  const bootstrapping = () => props.bootstrapping;
  const activeSession = () => props.activeSession;
  const label = createMemo(() => {
    if (bootstrapping()) {
      return "Reconnecting";
    }

    if (activeSession()) {
      return "Connected";
    }

    return "Ready";
  });
  return (
    <article class="panel-surface grid gap-5 p-5">
      <div class="flex items-baseline justify-between gap-3">
        <p class="overline-copy text-[0.75rem] text-on-surface-variant">Your account</p>
        <p class="overline-copy text-[0.68rem] text-on-surface-variant">{label()}</p>
      </div>

      <SessionBody
        activeSession={props.activeSession}
        activeAccount={props.activeAccount}
        bootstrapping={props.bootstrapping} />

      <Presence>
        <Show when={props.reauthNeeded}>
          <ReauthBanner onReauth={props.onReauth} />
        </Show>
      </Presence>
    </article>
  );
}

export function SessionBody(
  props: { activeSession: ActiveSession | null; activeAccount: AccountSummary | null; bootstrapping: boolean },
) {
  return (
    <Show when={!props.bootstrapping} fallback={<ProfileSkeleton />}>
      <Show when={props.activeSession} fallback={<SessionEmptyState />}>
        {(session) => <SessionProfile session={session()} activeAccount={props.activeAccount} />}
      </Show>
    </Show>
  );
}
