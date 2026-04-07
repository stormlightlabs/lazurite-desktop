import { Icon } from "$/components/shared/Icon";
import { QuotedPostPreview } from "$/components/shared/QuotedPostPreview";
import { buildPublicPostUrl, getDisplayName, getPostText } from "$/lib/feeds";
import type { PostView } from "$/lib/types";
import { createMemo, For, Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import type { AutosaveStatus } from "./types";

type ComposerSuggestion = { label: string; type: "handle" | "hashtag" };

export function ComposerLauncher(props: { activeAvatar?: string | null; activeHandle: string; onCompose: () => void }) {
  return (
    <button
      class="mb-4 flex w-full min-w-0 items-center gap-3 rounded-3xl border-0 bg-white/3 px-4 py-4 text-left text-on-surface-variant shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] transition duration-150 ease-out hover:bg-white/5 max-[760px]:gap-2 max-[760px]:px-3.5 max-[520px]:py-3.5"
      type="button"
      onClick={() => props.onCompose()}>
      <ComposerIdentityAvatar
        activeAvatar={props.activeAvatar}
        activeHandle={props.activeHandle}
        sizeClass="h-10 w-10" />
      <div class="min-w-0 flex-1">
        <p class="m-0 wrap-break-word text-[0.9rem] text-on-surface-variant">What's happening?</p>
      </div>
      <div class="flex items-center gap-1 text-on-surface-variant max-[520px]:hidden">
        <Icon aria-hidden="true" kind="at" />
        <Icon aria-hidden="true" kind="hashtag" />
        <Icon aria-hidden="true" kind="quote" />
      </div>
    </button>
  );
}

type FeedComposerProps = {
  activeAvatar?: string | null;
  activeHandle: string | null;
  autosaveStatus?: AutosaveStatus;
  draftCount?: number;
  open: boolean;
  pending: boolean;
  quoteTarget: PostView | null;
  replyTarget: PostView | null;
  suggestions: ComposerSuggestion[];
  text: string;
  onApplySuggestion: (value: string) => void;
  onClearQuote: () => void;
  onClearReply: () => void;
  onClose: () => void;
  onOpenDrafts?: () => void;
  onSaveDraft?: () => void;
  onSubmit: () => void;
  onTextChange: (value: string) => void;
};

type ComposerSurfaceProps = Omit<FeedComposerProps, "open"> & {
  layout?: "dialog" | "window";
  onOpenDrafts?: () => void;
  onSaveDraft?: () => void;
};

export function FeedComposer(props: FeedComposerProps) {
  return (
    <Presence>
      <Show when={props.open}>
        <div class="fixed inset-0 z-50">
          <Motion.button
            class="absolute inset-0 h-full w-full border-0 bg-black/80 backdrop-blur-[20px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            type="button"
            onClick={() => props.onClose()} />

          <ComposerSurface
            activeAvatar={props.activeAvatar}
            activeHandle={props.activeHandle}
            autosaveStatus={props.autosaveStatus}
            draftCount={props.draftCount}
            layout="dialog"
            pending={props.pending}
            quoteTarget={props.quoteTarget}
            replyTarget={props.replyTarget}
            suggestions={props.suggestions}
            text={props.text}
            onApplySuggestion={props.onApplySuggestion}
            onClearQuote={props.onClearQuote}
            onClearReply={props.onClearReply}
            onClose={props.onClose}
            onOpenDrafts={props.onOpenDrafts}
            onSaveDraft={props.onSaveDraft}
            onSubmit={props.onSubmit}
            onTextChange={props.onTextChange} />
        </div>
      </Show>
    </Presence>
  );
}

export function ComposerSurface(props: ComposerSurfaceProps) {
  const count = createMemo(() => [...props.text].length);
  const progress = createMemo(() => Math.min(100, (count() / 300) * 100));

  return (
    <div class={getComposerViewportClass(props.layout)}>
      <Motion.section
        class={getComposerPanelClass(props.layout)}
        initial={{ opacity: 0, y: 36 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ duration: 0.24, easing: [0.22, 1, 0.36, 1] }}>
        <ComposerHeader
          activeAvatar={props.activeAvatar}
          activeHandle={props.activeHandle}
          draftCount={props.draftCount}
          pending={props.pending}
          quoteTarget={props.quoteTarget}
          text={props.text}
          onClose={props.onClose}
          onOpenDrafts={props.onOpenDrafts}
          onSaveDraft={props.onSaveDraft}
          onSubmit={props.onSubmit} />
        <ComposerBody
          activeAvatar={props.activeAvatar}
          activeHandle={props.activeHandle}
          quoteTarget={props.quoteTarget}
          replyTarget={props.replyTarget}
          suggestions={props.suggestions}
          text={props.text}
          onApplySuggestion={props.onApplySuggestion}
          onClearQuote={props.onClearQuote}
          onClearReply={props.onClearReply}
          onTextChange={props.onTextChange} />
        <ComposerFooter autosaveStatus={props.autosaveStatus ?? "idle"} count={count()} progress={progress()} />
      </Motion.section>
    </div>
  );
}

function getComposerViewportClass(layout: ComposerSurfaceProps["layout"]) {
  if (layout === "window") {
    return "mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center p-6 max-[640px]:p-4";
  }

  return "relative z-10 flex min-h-screen items-center justify-center p-4 pt-16";
}

function getComposerPanelClass(layout: ComposerSurfaceProps["layout"]) {
  const classes = [
    "grid w-full max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[1.8rem] bg-surface-container-high shadow-[0_25px_70px_rgba(0,0,0,0.7),0_0_0_1px_rgba(125,175,255,0.14)]",
  ];

  if (layout === "window") {
    classes.push("max-h-[min(48rem,calc(100vh-3rem))]");
  } else {
    classes.push("max-h-[calc(100vh-2rem)]");
  }

  return classes.join(" ");
}

function ComposerHeader(
  props: {
    activeAvatar?: string | null;
    activeHandle: string | null;
    draftCount?: number;
    pending: boolean;
    quoteTarget: PostView | null;
    text: string;
    onClose: () => void;
    onOpenDrafts?: () => void;
    onSaveDraft?: () => void;
    onSubmit: () => void;
  },
) {
  return (
    <header class="flex items-center justify-between border-b border-white/5 px-6 py-4">
      <div class="flex items-center gap-3">
        <button
          class="inline-flex h-10 w-10 items-center justify-center rounded-xl border-0 bg-transparent text-on-surface-variant transition duration-150 ease-out hover:bg-white/5 hover:text-on-surface"
          type="button"
          onClick={() => props.onClose()}>
          <Icon aria-hidden="true" iconClass="i-ri-close-line" />
        </button>
        <ComposerTitle activeHandle={props.activeHandle} />
      </div>
      <div class="flex items-center gap-2">
        <ComposerSaveDraftButton onSaveDraft={props.onSaveDraft} />
        <ComposerDraftsButton draftCount={props.draftCount} onOpenDrafts={props.onOpenDrafts} />
        <ComposerSubmitButton
          disabled={props.pending || (!props.text.trim() && !props.quoteTarget)}
          pending={props.pending}
          onSubmit={props.onSubmit} />
      </div>
    </header>
  );
}

function ComposerSaveDraftButton(props: { onSaveDraft?: () => void }) {
  return (
    <Show when={props.onSaveDraft}>
      <button
        class="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border-0 bg-transparent px-3 text-sm text-on-surface-variant transition duration-150 ease-out hover:bg-white/5 hover:text-on-surface"
        type="button"
        title="Save as draft (Ctrl+S)"
        onClick={() => props.onSaveDraft?.()}>
        <Icon aria-hidden="true" iconClass="i-ri-save-line" />
        <span class="max-[520px]:hidden">Save</span>
      </button>
    </Show>
  );
}

function ComposerDraftsButton(props: { draftCount?: number; onOpenDrafts?: () => void }) {
  return (
    <Show when={props.onOpenDrafts}>
      <button
        class="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border-0 bg-transparent text-on-surface-variant transition duration-150 ease-out hover:bg-white/5 hover:text-on-surface"
        type="button"
        title="Drafts (Ctrl+D)"
        onClick={() => props.onOpenDrafts?.()}>
        <Icon aria-hidden="true" iconClass="i-ri-draft-line" />
        <Show when={(props.draftCount ?? 0) > 0}>
          <span class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-semibold leading-none text-on-primary-fixed">
            {props.draftCount}
          </span>
        </Show>
      </button>
    </Show>
  );
}

function ComposerTitle(props: { activeHandle: string | null }) {
  return (
    <div>
      <p class="m-0 text-base font-semibold text-on-surface">New Post</p>
      <Show when={props.activeHandle}>
        {(handle) => <p class="m-0 text-[0.76rem] text-on-surface-variant">@{handle().replace(/^@/, "")}</p>}
      </Show>
    </div>
  );
}

function ComposerSubmitButton(props: { disabled: boolean; pending: boolean; onSubmit: () => void }) {
  return (
    <button
      class="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-0 bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 text-sm font-semibold text-on-primary-fixed transition duration-150 ease-out hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
      type="button"
      disabled={props.disabled}
      onClick={() => props.onSubmit()}>
      <Icon aria-hidden="true" iconClass={props.pending ? "i-ri-loader-4-line" : "i-ri-send-plane-2-line"} />
      <span>{props.pending ? "Posting..." : "Post"}</span>
    </button>
  );
}

function ComposerBody(
  props: {
    activeAvatar?: string | null;
    activeHandle: string | null;
    quoteTarget: PostView | null;
    replyTarget: PostView | null;
    suggestions: ComposerSuggestion[];
    text: string;
    onApplySuggestion: (value: string) => void;
    onClearQuote: () => void;
    onClearReply: () => void;
    onTextChange: (value: string) => void;
  },
) {
  return (
    <div class="min-h-0 overflow-y-auto overscroll-contain p-6">
      <div class="flex gap-4 max-[640px]:flex-col">
        <ComposerAvatar activeAvatar={props.activeAvatar} activeHandle={props.activeHandle} />
        <div class="min-w-0 flex-1">
          <ComposerContexts
            quoteTarget={props.quoteTarget}
            replyTarget={props.replyTarget}
            onClearQuote={props.onClearQuote}
            onClearReply={props.onClearReply} />
          <ComposerTextarea text={props.text} onTextChange={props.onTextChange} />
          <QuotePreview post={props.quoteTarget} />
          <SuggestionPanel suggestions={props.suggestions} onApplySuggestion={props.onApplySuggestion} />
        </div>
      </div>
    </div>
  );
}

function ComposerAvatar(props: { activeAvatar?: string | null; activeHandle: string | null }) {
  return (
    <div class="mt-1">
      <ComposerIdentityAvatar
        activeAvatar={props.activeAvatar}
        activeHandle={props.activeHandle}
        sizeClass="h-11 w-11" />
    </div>
  );
}

function ComposerIdentityAvatar(
  props: { activeAvatar?: string | null; activeHandle: string | null; sizeClass: "h-10 w-10" | "h-11 w-11" },
) {
  const fallback = () => (props.activeHandle ?? "L").slice(0, 1).toUpperCase();

  return (
    <div
      class={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(135deg,rgba(125,175,255,0.95),rgba(0,115,222,0.75))] text-sm font-semibold text-on-primary-fixed ${props.sizeClass}`}>
      <Show when={props.activeAvatar} fallback={fallback()}>
        {(avatar) => <img class="h-full w-full object-cover" src={avatar()} alt="" />}
      </Show>
    </div>
  );
}

function ComposerContexts(
  props: {
    quoteTarget: PostView | null;
    replyTarget: PostView | null;
    onClearQuote: () => void;
    onClearReply: () => void;
  },
) {
  return (
    <>
      <Show when={props.replyTarget}>
        {(post) => (
          <ContextChip
            icon="i-ri-reply-line"
            label={`Replying to ${getDisplayName(post().author)}`}
            onClear={props.onClearReply} />
        )}
      </Show>
      <Show when={props.quoteTarget}>
        {(post) => (
          <ContextChip
            icon="i-ri-chat-quote-line"
            label={`Quoting ${getDisplayName(post().author)}`}
            onClear={props.onClearQuote} />
        )}
      </Show>
    </>
  );
}

function ComposerTextarea(props: { text: string; onTextChange: (value: string) => void }) {
  return (
    <textarea
      class="min-h-40 w-full resize-none border-0 bg-transparent p-0 text-[1.08rem] leading-[1.65] text-on-surface placeholder:text-white/25 focus:outline-none wrap-anywhere"
      placeholder="What's happening?"
      value={props.text}
      onInput={(event) => props.onTextChange(event.currentTarget.value)} />
  );
}

function QuotePreview(props: { post: PostView | null }) {
  return (
    <Show when={props.post}>
      {(post) => (
        <QuotedPostPreview
          author={post().author}
          class="mt-4 rounded-2xl bg-black/30 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
          href={buildPublicPostUrl(post())}
          text={getPostText(post()) || "Quoted post"}
          title="Quote preview" />
      )}
    </Show>
  );
}

function SuggestionPanel(props: { suggestions: ComposerSuggestion[]; onApplySuggestion: (value: string) => void }) {
  const suggestions = () => props.suggestions.slice(0, 12);
  return (
    <Show when={props.suggestions.length > 0}>
      <div class="mt-4 rounded-2xl bg-black/35 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
        <p class="m-0 text-xs uppercase tracking-[0.12em] text-on-surface-variant">Suggestions</p>
        <div class="mt-3 max-h-44 overflow-y-auto overscroll-contain pr-1">
          <div class="grid gap-2">
            <For each={suggestions()}>
              {(suggestion) => <SuggestionChip suggestion={suggestion} onApplySuggestion={props.onApplySuggestion} />}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
}

function SuggestionChip(props: { suggestion: ComposerSuggestion; onApplySuggestion: (value: string) => void }) {
  const iconKind = () => (props.suggestion.type === "handle" ? "at" : "hashtag");
  return (
    <button
      class="inline-flex w-full items-center gap-2 rounded-2xl border-0 bg-white/6 px-3 py-2 text-left text-[0.8rem] text-on-surface transition duration-150 ease-out hover:-translate-y-px hover:bg-white/10"
      type="button"
      onClick={() => props.onApplySuggestion(props.suggestion.label)}>
      <Icon aria-hidden="true" kind={iconKind()} />
      <span class="min-w-0 break-all">{props.suggestion.label}</span>
    </button>
  );
}

function ComposerFooter(props: { autosaveStatus: AutosaveStatus; count: number; progress: number }) {
  return (
    <footer class="flex items-center justify-between border-t border-white/5 px-6 py-4">
      <ComposerToolbar />
      <AutosaveIndicator status={props.autosaveStatus} />
      <ComposerCounter count={props.count} progress={props.progress} />
    </footer>
  );
}

function AutosaveIndicator(props: { status: AutosaveStatus }) {
  return (
    <Show when={props.status !== "idle"}>
      <span class="text-xs text-on-surface-variant">
        <Show when={props.status === "saving"} fallback="Saved">Saving...</Show>
      </span>
    </Show>
  );
}

function ComposerToolbar() {
  return (
    <div class="flex items-center gap-2 text-on-surface-variant">
      <ToolbarButton icon="i-ri-at-line" label="Mentions" />
      <ToolbarButton icon="i-ri-hashtag" label="Hashtags" />
      <ToolbarButton icon="i-ri-chat-quote-line" label="Quote" />
    </div>
  );
}

function ComposerCounter(props: { count: number; progress: number }) {
  return (
    <div class="flex items-center gap-3">
      <div class="relative h-9 w-9">
        <svg class="h-full w-full -rotate-90" viewBox="0 0 36 36">
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            stroke-width="3" />
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="var(--primary)"
            stroke-dasharray={`${props.progress}, 100`}
            stroke-width="3" />
        </svg>
        <span class="absolute inset-0 flex items-center justify-center text-[0.68rem] font-semibold text-on-surface">
          {props.count}
        </span>
      </div>
      <span class="text-xs text-on-surface-variant">/ 300</span>
    </div>
  );
}

function ContextChip(props: { icon: string; label: string; onClear: () => void }) {
  return (
    <div class="mb-3 inline-flex max-w-full items-center gap-2 rounded-full bg-white/6 px-3 py-2 text-[0.8rem] text-on-surface">
      <Icon aria-hidden="true" iconClass={props.icon} />
      <span class="truncate">{props.label}</span>
      <button
        class="inline-flex h-7 w-7 items-center justify-center rounded-full border-0 bg-transparent text-on-surface-variant transition duration-150 ease-out hover:bg-white/6 hover:text-on-surface"
        type="button"
        onClick={() => props.onClear()}>
        <Icon aria-hidden="true" kind="close" />
      </button>
    </div>
  );
}

function ToolbarButton(props: { icon: string; label: string }) {
  return (
    <button
      class="inline-flex h-11 w-11 items-center justify-center rounded-xl border-0 bg-transparent transition duration-150 ease-out hover:bg-white/5 hover:text-primary"
      type="button"
      title={props.label}>
      <Icon aria-hidden="true" iconClass={props.icon} />
    </button>
  );
}
