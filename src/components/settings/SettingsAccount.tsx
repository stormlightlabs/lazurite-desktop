import { useAppSession } from "$/contexts/app-session";
import type { AccountSummary } from "$/lib/types";
import { useNavigate } from "@solidjs/router";
import { For, Show } from "solid-js";
import { Icon } from "../shared/Icon";
import { SettingsCard } from "./SettingsCard";

function AccountItem(props: { account: AccountSummary; active: boolean; onRemove: () => void; onSwitch: () => void }) {
  return (
    <div class="tone-muted flex items-center justify-between rounded-xl p-3 transition-colors hover:bg-(--panel-muted-hover)">
      <div class="flex items-center gap-3">
        <div class="relative">
          <div class="h-10 w-10 overflow-hidden rounded-full">
            <Show
              when={props.account.avatar}
              fallback={
                <div class="flex h-full w-full items-center justify-center bg-surface-container-high text-sm font-medium text-on-surface">
                  {props.account.handle.slice(0, 2).toUpperCase()}
                </div>
              }>
              {(avatar) => <img src={avatar()} alt={props.account.handle} class="h-full w-full object-cover" />}
            </Show>
          </div>
          <Show when={props.active}>
            <div class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-container bg-green-500" />
          </Show>
        </div>
        <div>
          <p class="text-sm font-medium text-on-surface">@{props.account.handle}</p>
          <p class="text-xs text-on-surface-variant">{props.account.did}</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Show
          when={props.active}
          fallback={
            <button
              type="button"
              onClick={() => props.onSwitch()}
              class="ui-button-secondary px-3 py-1.5 text-xs">
              Switch
            </button>
          }>
          <span class="rounded-full bg-primary/20 px-2 py-1 text-xs text-primary">Active</span>
        </Show>
        <button
          type="button"
          onClick={() => props.onRemove()}
          class="rounded-lg p-2 text-on-surface-variant transition hover:bg-surface-bright hover:text-on-surface"
          title="Remove account">
          <span class="flex items-center">
            <Icon kind="close" class="text-sm" />
          </span>
        </button>
      </div>
    </div>
  );
}

export function AccountControl(
  props: {
    openConfirmation: (
      config: {
        title: string;
        message: string;
        confirmText?: string;
        type?: "danger" | "default";
        onConfirm: () => void;
      },
    ) => void;
    onOpenFollowHygiene: () => void;
  },
) {
  const session = useAppSession();
  const navigate = useNavigate();
  return (
    <SettingsCard icon="user" title="Accounts">
      <div class="grid gap-3">
        <For each={session.accounts}>
          {(account) => (
            <AccountItem
              account={account}
              active={account.active}
              onSwitch={() => void session.switchAccount(account.did)}
              onRemove={() =>
                props.openConfirmation({
                  title: "Remove Account",
                  message:
                    `Are you sure you want to remove @${account.handle}? This will delete all local data for this account.`,
                  type: "danger",
                  onConfirm: () => void session.logout(account.did),
                })} />
          )}
        </For>
        <button
          type="button"
          onClick={() => navigate("/auth")}
          class="inline-flex items-center justify-center gap-2 rounded-full border-0 bg-primary px-4 py-2 text-sm font-medium text-on-primary-fixed transition hover:opacity-90">
          Add account
        </button>

        <div class="tone-muted grid gap-3 rounded-xl p-3 shadow-(--inset-shadow)">
          <div class="grid gap-1">
            <p class="m-0 text-sm font-medium text-on-surface">Follow hygiene</p>
            <p class="m-0 text-xs leading-relaxed text-on-surface-variant">
              Audit follows for deleted, deactivated, blocked, and hidden accounts.
            </p>
          </div>
          <button
            type="button"
            onClick={() => props.onOpenFollowHygiene()}
            class="ui-control ui-control-hoverable inline-flex min-h-9 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-on-surface">
            <Icon iconClass="i-ri-user-search-line" class="text-base" />
            Audit follows
          </button>
        </div>
      </div>
    </SettingsCard>
  );
}
