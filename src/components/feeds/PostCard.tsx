import { Icon } from "$/components/shared/Icon";
import {
  formatCount,
  formatRelativeTime,
  getAvatarLabel,
  getDisplayName,
  getPostCreatedAt,
  getPostText,
  getQuotedAuthor,
  getQuotedText,
} from "$/lib/feeds";
import type { FeedViewPost, ImagesEmbedView, PostView } from "$/lib/types";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import { Motion } from "solid-motionone";

type PostCardProps = {
  focused?: boolean;
  item?: FeedViewPost;
  likePending?: boolean;
  onFocus?: () => void;
  onLike?: () => void;
  onOpenThread?: () => void;
  onQuote?: () => void;
  onReply?: () => void;
  onRepost?: () => void;
  post: PostView;
  pulseLike?: boolean;
  pulseRepost?: boolean;
  registerRef?: (element: HTMLElement) => void;
  repostPending?: boolean;
};

export function PostCard(props: PostCardProps) {
  const authorName = createMemo(() => getDisplayName(props.post.author));
  const createdAt = createMemo(() => formatRelativeTime(getPostCreatedAt(props.post)));
  const isLiked = createMemo(() => !!props.post.viewer?.like);
  const isReposted = createMemo(() => !!props.post.viewer?.repost);
  const reasonLabel = createMemo(() => {
    const reason = props.item?.reason;
    if (!reason || reason.$type !== "app.bsky.feed.defs#reasonRepost") {
      return null;
    }

    return `${getDisplayName(reason.by)} reposted`;
  });

  return (
    <Motion.article
      ref={(element) => props.registerRef?.(element)}
      class="group rounded-[1.6rem] bg-white/2.5 px-5 py-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] transition duration-150 ease-out hover:bg-white/4"
      classList={{
        "bg-[linear-gradient(135deg,rgba(125,175,255,0.11),rgba(0,115,222,0.06))] shadow-[inset_0_0_0_1px_rgba(125,175,255,0.22),0_0_0_1px_rgba(125,175,255,0.08)]":
          !!props.focused,
      }}
      role="article"
      tabIndex={0}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      onClick={() => props.onFocus?.()}
      onFocus={() => props.onFocus?.()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          props.onOpenThread?.();
        }
      }}>
      <Show when={reasonLabel()}>
        <div class="mb-3 flex items-center gap-2 text-xs font-medium tracking-[0.04em] text-primary">
          <Icon aria-hidden="true" iconClass="i-ri-repeat-2-line" />
          <span>{reasonLabel()}</span>
        </div>
      </Show>

      <div class="flex gap-3">
        <AuthorAvatar avatar={props.post.author.avatar} label={getAvatarLabel(props.post.author)} />

        <div class="min-w-0 flex-1">
          <header class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="wrap-break-word text-base font-semibold tracking-[-0.01em] text-on-surface">
              {authorName()}
            </span>
            <span class="break-all text-xs text-on-surface-variant">@{props.post.author.handle.replace(/^@/, "")}</span>
            <span class="text-xs text-on-surface-variant">{createdAt()}</span>
          </header>

          <Show when={getPostText(props.post)}>
            {(text) => (
              <p class="m-0 whitespace-pre-wrap wrap-break-word text-base leading-[1.65] text-on-secondary-container">
                <LinkifiedText text={text()} />
              </p>
            )}
          </Show>

          <PostEmbeds post={props.post} />

          <footer class="mt-4 flex flex-wrap items-center gap-2">
            <ActionButton
              active={isLiked()}
              busy={!!props.likePending}
              icon="i-ri-heart-3-line"
              iconActive="i-ri-heart-3-fill"
              label={formatCount(props.post.likeCount)}
              pulse={!!props.pulseLike}
              onClick={props.onLike} />
            <ActionButton icon="i-ri-chat-1-line" label={formatCount(props.post.replyCount)} onClick={props.onReply} />
            <ActionButton
              active={isReposted()}
              busy={!!props.repostPending}
              icon="i-ri-repeat-2-line"
              iconActive="i-ri-repeat-2-fill"
              label={formatCount(props.post.repostCount)}
              pulse={!!props.pulseRepost}
              onClick={props.onRepost} />
            <ActionButton icon="i-ri-chat-quote-line" label="Quote" onClick={props.onQuote} />
            <ActionButton icon="i-ri-node-tree" label="Thread" onClick={props.onOpenThread} />
          </footer>
        </div>
      </div>
    </Motion.article>
  );
}

function AuthorAvatar(props: { avatar?: string | null; label: string }) {
  return (
    <div class="relative mt-0.5 h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[linear-gradient(135deg,rgba(125,175,255,0.9),rgba(0,115,222,0.72))] shadow-[0_0_0_2px_rgba(14,14,14,1),0_0_0_3px_rgba(125,175,255,0.28)]">
      <Show
        when={props.avatar}
        fallback={
          <div class="flex h-full w-full items-center justify-center text-sm font-semibold text-on-primary-fixed">
            {props.label}
          </div>
        }>
        {(avatar) => <img class="h-full w-full object-cover" src={avatar()} alt="" />}
      </Show>
    </div>
  );
}

function ActionButton(
  props: {
    active?: boolean;
    busy?: boolean;
    icon: string;
    iconActive?: string;
    label: string;
    onClick?: () => void;
    pulse?: boolean;
  },
) {
  return (
    <button
      aria-label={props.label}
      class="inline-flex items-center gap-1.5 rounded-full border-0 bg-transparent px-3 py-2 text-xs text-on-surface-variant transition duration-150 ease-out hover:-translate-y-px hover:bg-white/5 hover:text-primary disabled:cursor-wait disabled:opacity-70"
      classList={{ "text-primary": !!props.active }}
      type="button"
      disabled={props.busy}
      onClick={() => props.onClick?.()}>
      <Motion.span
        class="flex items-center"
        animate={{ scale: props.pulse ? [1, 1.3, 1] : 1 }}
        transition={{ duration: 0.28 }}>
        <Icon aria-hidden="true" iconClass={props.active ? props.iconActive ?? props.icon : props.icon} />
      </Motion.span>
      <span class="max-w-24 truncate">{props.busy ? "..." : props.label}</span>
    </button>
  );
}

function PostEmbeds(props: { post: PostView }) {
  const embed = createMemo(() => props.post.embed);

  return (
    <Show when={embed()}>
      {(current) => (
        <div class="mt-4">
          <Switch>
            <Match when={current().$type === "app.bsky.embed.images#view"}>
              <ImageEmbed embed={current() as ImagesEmbedView} />
            </Match>
            <Match when={current().$type === "app.bsky.embed.external#view"}>
              <ExternalEmbed
                description={(current() as { external: { description?: string } }).external.description}
                thumb={(current() as { external: { thumb?: string } }).external.thumb}
                title={(current() as { external: { title?: string } }).external.title}
                uri={(current() as { external: { uri?: string } }).external.uri} />
            </Match>
            <Match when={current().$type === "app.bsky.embed.video#view"}>
              <ExternalEmbed
                description={(current() as { alt?: string }).alt}
                thumb={(current() as { thumbnail?: string }).thumbnail}
                title="Video attachment"
                uri={(current() as { playlist?: string }).playlist} />
            </Match>
            <Match
              when={current().$type === "app.bsky.embed.record#view"
                || current().$type === "app.bsky.embed.recordWithMedia#view"}>
              <QuoteEmbed author={getQuotedAuthor(current())} text={getQuotedText(current())} title="Quoted post" />
            </Match>
          </Switch>
        </div>
      )}
    </Show>
  );
}

function ImageEmbed(props: { embed: ImagesEmbedView }) {
  return (
    <div class="grid gap-2" classList={{ "grid-cols-2": props.embed.images.length > 1 }}>
      <For each={props.embed.images.slice(0, 4)}>
        {(image) => (
          <div class="overflow-hidden rounded-[1.2rem] bg-black/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
            <img class="max-h-88 w-full object-cover" src={image.fullsize ?? image.thumb} alt={image.alt ?? ""} />
          </div>
        )}
      </For>
    </div>
  );
}

function ExternalEmbed(props: { description?: string; thumb?: string; title?: string; uri?: string }) {
  return (
    <a
      class="grid gap-3 overflow-hidden rounded-[1.25rem] bg-black/30 p-3 text-inherit no-underline shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)] transition duration-150 ease-out hover:bg-black/40"
      href={props.uri}
      rel="noreferrer"
      target="_blank">
      <Show when={props.thumb}>
        {(thumb) => <img class="max-h-64 w-full rounded-2xl object-cover" src={thumb()} alt="" />}
      </Show>
      <div class="grid gap-1">
        <p class="m-0 wrap-break-word text-sm font-semibold text-on-surface">{props.title || "External link"}</p>
        <Show when={props.description}>
          {(description) => (
            <p class="m-0 wrap-break-word text-sm leading-[1.55] text-on-surface-variant">{description()}</p>
          )}
        </Show>
        <Show when={props.uri}>
          {(uri) => (
            <p class="m-0 break-all text-[0.74rem] uppercase tracking-[0.08em] text-primary">
              {uri().replace(/^https?:\/\//, "")}
            </p>
          )}
        </Show>
      </div>
    </a>
  );
}

function QuoteEmbed(props: { author: PostView["author"] | null; text?: unknown; title: string }) {
  const preview = createMemo(() => (typeof props.text === "string" ? props.text : ""));

  return (
    <div class="rounded-[1.25rem] bg-black/30 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
      <p class="m-0 text-xs uppercase tracking-[0.12em] text-on-surface-variant">{props.title}</p>
      <Show when={props.author}>
        {(author) => (
          <p class="mt-2 wrap-break-word text-sm font-semibold text-on-surface">
            {getDisplayName(author())}
            <span class="ml-1 break-all text-xs font-normal text-on-surface-variant">
              @{author().handle.replace(/^@/, "")}
            </span>
          </p>
        )}
      </Show>
      <Show when={preview()}>
        {(text) => <p class="mt-2 line-clamp-4 text-sm leading-[1.55] text-on-secondary-container">{text()}</p>}
      </Show>
    </div>
  );
}

function LinkifiedText(props: { text: string }) {
  const parts = () => props.text.split(/(https?:\/\/\S+|@[a-z0-9._-]+(?:\.[a-z0-9._-]+)+|#[\p{L}\p{N}_-]+)/giu);

  return (
    <For each={parts()}>
      {(part) => {
        if (/^https?:\/\//i.test(part)) {
          return (
            <a class="break-all text-primary no-underline hover:underline" href={part} rel="noreferrer" target="_blank">
              {part}
            </a>
          );
        }

        if (/^[@#]/.test(part)) {
          return <span class="break-all text-primary">{part}</span>;
        }

        return <span class="wrap-anywhere">{part}</span>;
      }}
    </For>
  );
}
