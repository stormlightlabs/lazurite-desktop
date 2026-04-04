import { ContextMenu, type ContextMenuAnchor, type ContextMenuItem } from "$/components/shared/ContextMenu";
import { Icon } from "$/components/shared/Icon";
import { PostRichText } from "$/components/shared/PostRichText";
import { QuotedPostPreview } from "$/components/shared/QuotedPostPreview";
import {
  buildPublicPostUrl,
  formatRelativeTime,
  getAvatarLabel,
  getDisplayName,
  getPostCreatedAt,
  getPostFacets,
  getPostText,
  getQuotedAuthor,
  getQuotedHref,
  getQuotedText,
  isReplyItem,
} from "$/lib/feeds";
import { buildProfileRoute, getProfileRouteActor } from "$/lib/profile";
import type { EmbedView, FeedViewPost, ImagesEmbedView, PostView, ProfileViewBasic, RichTextFacet } from "$/lib/types";
import { formatCount } from "$/lib/utils/text";
import { createMemo, createSignal, For, Match, type ParentProps, Show, Switch } from "solid-js";
import { Motion } from "solid-motionone";

type PostCardProps = {
  bookmarkPending?: boolean;
  focused?: boolean;
  item?: FeedViewPost;
  likePending?: boolean;
  onBookmark?: () => void;
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
  showActions?: boolean;
};

export function PostCard(props: PostCardProps) {
  const authorName = createMemo(() => getDisplayName(props.post.author));
  const createdAt = createMemo(() => formatRelativeTime(getPostCreatedAt(props.post)));
  const isBookmarked = createMemo(() => !!props.post.viewer?.bookmarked);
  const isLiked = createMemo(() => !!props.post.viewer?.like);
  const isReposted = createMemo(() => !!props.post.viewer?.repost);
  const likeCount = createMemo(() => formatCount(props.post.likeCount));
  const postText = createMemo(() => getPostText(props.post));
  const replyCount = createMemo(() => formatCount(props.post.replyCount));
  const repostCount = createMemo(() => formatCount(props.post.repostCount));
  const profileHref = createMemo(() => buildProfileRoute(getProfileRouteActor(props.post.author)));
  const reasonLabel = createMemo(() => {
    const reason = props.item?.reason;
    if (!reason || reason.$type !== "app.bsky.feed.defs#reasonRepost") {
      return null;
    }

    return `${getDisplayName(reason.by)} reposted`;
  });
  const replyLabel = createMemo(() => {
    const item = props.item;
    if (!item || !isReplyItem(item)) {
      return null;
    }

    const parent = item.reply?.parent;
    if (parent?.$type === "app.bsky.feed.defs#postView") {
      return `Replying to @${parent.author.handle.replace(/^@/, "")}`;
    }

    return "Reply in thread";
  });
  const [menuAnchor, setMenuAnchor] = createSignal<ContextMenuAnchor | null>(null);
  const [menuOpen, setMenuOpen] = createSignal(false);
  let menuTriggerRef: HTMLButtonElement | undefined;

  const menuItems = createMemo<ContextMenuItem[]>(() => {
    const items: ContextMenuItem[] = [];

    if (props.onReply) {
      items.push({ icon: "i-ri-chat-1-line", label: "Reply", onSelect: props.onReply });
    }

    if (props.onQuote) {
      items.push({ icon: "i-ri-chat-quote-line", label: "Quote", onSelect: props.onQuote });
    }

    if (props.onLike) {
      items.push({
        icon: isLiked() ? "i-ri-heart-3-fill" : "i-ri-heart-3-line",
        label: isLiked() ? "Unlike" : "Like",
        onSelect: props.onLike,
      });
    }

    if (props.onRepost) {
      items.push({
        icon: isReposted() ? "i-ri-repeat-2-fill" : "i-ri-repeat-2-line",
        label: isReposted() ? "Undo repost" : "Repost",
        onSelect: props.onRepost,
      });
    }

    if (props.onBookmark) {
      items.push({
        icon: isBookmarked() ? "i-ri-bookmark-fill" : "i-ri-bookmark-line",
        label: isBookmarked() ? "Unsave" : "Save",
        onSelect: props.onBookmark,
      });
    }

    items.push({
      icon: "i-ri-link-m",
      label: "Copy post link",
      onSelect: () => void navigator.clipboard?.writeText(buildPublicPostUrl(props.post)),
    });

    if (props.onOpenThread) {
      items.push({ icon: "i-ri-node-tree", label: "Open thread", onSelect: props.onOpenThread });
    }

    return items;
  });

  function closeMenu() {
    setMenuOpen(false);
    setMenuAnchor(null);
  }

  function openMenuFromTrigger(element: HTMLButtonElement) {
    setMenuAnchor({ kind: "element", rect: element.getBoundingClientRect() });
    setMenuOpen(true);
  }

  function openMenuFromPointer(event: MouseEvent) {
    event.preventDefault();
    setMenuAnchor({ kind: "point", x: event.clientX, y: event.clientY });
    setMenuOpen(true);
  }

  return (
    <article
      ref={(element) => props.registerRef?.(element)}
      class="group min-w-0 overflow-hidden rounded-3xl bg-white/2.5 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] transition duration-150 ease-out hover:bg-white/4 max-[760px]:px-3.5 max-[760px]:py-3.5 max-[520px]:rounded-3xl max-[520px]:px-3 max-[520px]:py-3"
      classList={{
        "bg-[linear-gradient(135deg,rgba(125,175,255,0.11),rgba(0,115,222,0.06))] shadow-[inset_0_0_0_1px_rgba(125,175,255,0.22),0_0_0_1px_rgba(125,175,255,0.08)]":
          !!props.focused,
      }}
      role="article"
      onContextMenu={(event) => {
        if (menuItems().length === 0 || isInteractiveTarget(event.target)) {
          return;
        }

        openMenuFromPointer(event);
      }}>
      <Show when={reasonLabel()}>
        <div class="mb-3 flex items-center gap-2 text-xs font-medium tracking-[0.04em] text-primary">
          <Icon aria-hidden="true" iconClass="i-ri-repeat-2-line" />
          <span>{reasonLabel()}</span>
        </div>
      </Show>
      <Show when={replyLabel()}>
        <div class="mb-3 flex items-center gap-2 text-xs font-medium tracking-[0.04em] text-on-surface-variant">
          <Icon aria-hidden="true" iconClass="i-ri-corner-down-right-line" />
          <span>{replyLabel()}</span>
        </div>
      </Show>

      <div class="flex min-w-0 gap-3">
        <a class="shrink-0 no-underline" href={`#${profileHref()}`} onClick={(event) => event.stopPropagation()}>
          <AuthorAvatar avatar={props.post.author.avatar} label={getAvatarLabel(props.post.author)} />
        </a>

        <div class="min-w-0 flex-1">
          <PostPrimaryRegion onFocus={props.onFocus} onOpenThread={props.onOpenThread}>
            <PostHeader
              authorName={authorName()}
              createdAt={createdAt()}
              profileHref={profileHref()}
              post={props.post} />

            <PostBodyText facets={getPostFacets(props.post)} text={postText()} />

            <PostEmbeds post={props.post} />
          </PostPrimaryRegion>

          <Show when={props.showActions !== false}>
            <PostActions
              bookmarkPending={!!props.bookmarkPending}
              isBookmarked={isBookmarked()}
              isLiked={isLiked()}
              isReposted={isReposted()}
              likeCount={likeCount()}
              likePending={!!props.likePending}
              menuOpen={menuOpen()}
              pulseLike={!!props.pulseLike}
              pulseRepost={!!props.pulseRepost}
              replyCount={replyCount()}
              repostCount={repostCount()}
              repostPending={!!props.repostPending}
              triggerRef={(element) => {
                menuTriggerRef = element;
              }}
              onBookmark={props.onBookmark}
              onLike={props.onLike}
              onMenuOpen={openMenuFromTrigger}
              onOpenThread={props.onOpenThread}
              onQuote={props.onQuote}
              onReply={props.onReply}
              onRepost={props.onRepost} />
          </Show>
        </div>
      </div>

      <ContextMenu
        anchor={menuAnchor()}
        items={menuItems()}
        label="Post actions"
        open={menuOpen()}
        returnFocusTo={menuTriggerRef}
        onClose={closeMenu} />
    </article>
  );
}

function PostHeader(props: { authorName: string; createdAt: string; post: PostView; profileHref: string }) {
  return (
    <header class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <a
        class="wrap-break-word text-base font-semibold tracking-[-0.01em] text-on-surface no-underline transition hover:text-primary"
        href={`#${props.profileHref}`}
        onClick={(event) => event.stopPropagation()}>
        {props.authorName}
      </a>
      <a
        class="break-all text-xs text-on-surface-variant no-underline transition hover:text-primary"
        href={`#${props.profileHref}`}
        onClick={(event) => event.stopPropagation()}>
        @{props.post.author.handle.replace(/^@/, "")}
      </a>
      <span class="text-xs text-on-surface-variant">{props.createdAt}</span>
    </header>
  );
}

function PostPrimaryRegion(props: ParentProps<{ onFocus?: () => void; onOpenThread?: () => void }>) {
  const interactive = () => !!props.onOpenThread;

  return (
    <div
      class="min-w-0 rounded-2xl outline-none transition duration-150 ease-out p-2"
      classList={{
        "cursor-pointer hover:bg-white/2 focus-visible:bg-white/3 focus-visible:ring-1 focus-visible:ring-primary/30":
          interactive(),
      }}
      aria-label={interactive() ? "Open thread" : undefined}
      role={interactive() ? "button" : undefined}
      tabIndex={interactive() ? 0 : undefined}
      onClick={() => props.onOpenThread?.()}
      onFocus={() => props.onFocus?.()}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && props.onOpenThread) {
          event.preventDefault();
          props.onOpenThread();
        }
      }}>
      {props.children}
    </div>
  );
}

function PostActions(
  props: {
    bookmarkPending: boolean;
    isBookmarked: boolean;
    isLiked: boolean;
    isReposted: boolean;
    likeCount: string;
    likePending: boolean;
    menuOpen: boolean;
    pulseLike: boolean;
    pulseRepost: boolean;
    replyCount: string;
    repostCount: string;
    repostPending: boolean;
    triggerRef: (element: HTMLButtonElement) => void;
    onBookmark?: () => void;
    onLike?: () => void;
    onMenuOpen: (element: HTMLButtonElement) => void;
    onOpenThread?: () => void;
    onQuote?: () => void;
    onReply?: () => void;
    onRepost?: () => void;
  },
) {
  return (
    <footer class="mt-4 flex min-w-0 flex-wrap items-center gap-2 max-[520px]:gap-1">
      <ActionButton
        active={props.isLiked}
        busy={props.likePending}
        icon="i-ri-heart-3-line"
        iconActive="i-ri-heart-3-fill"
        label={props.likeCount}
        pulse={props.pulseLike}
        onClick={props.onLike} />
      <ActionButton icon="i-ri-chat-1-line" label={props.replyCount} onClick={props.onReply} />
      <ActionButton
        active={props.isReposted}
        busy={props.repostPending}
        icon="i-ri-repeat-2-line"
        iconActive="i-ri-repeat-2-fill"
        label={props.repostCount}
        pulse={props.pulseRepost}
        onClick={props.onRepost} />
      <ActionButton
        active={props.isBookmarked}
        busy={props.bookmarkPending}
        icon="i-ri-bookmark-line"
        iconActive="i-ri-bookmark-fill"
        label={props.isBookmarked ? "Saved" : "Save"}
        onClick={props.onBookmark} />
      <ActionButton icon="i-ri-chat-quote-line" label="Quote" onClick={props.onQuote} />
      <ActionButton icon="i-ri-node-tree" label="Thread" onClick={props.onOpenThread} />
      <button
        aria-label="More actions"
        ref={(element) => props.triggerRef(element)}
        aria-expanded={props.menuOpen}
        aria-haspopup="menu"
        class="inline-flex items-center justify-center rounded-full border-0 bg-transparent px-3 py-2 text-xs text-on-surface-variant transition duration-150 ease-out hover:-translate-y-px hover:bg-white/5 hover:text-primary max-[520px]:px-2.5"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          props.onMenuOpen(event.currentTarget);
        }}>
        <Icon aria-hidden="true" iconClass="i-ri-more-fill" />
      </button>
    </footer>
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

function PostBodyText(props: { facets: RichTextFacet[]; text: string }) {
  return (
    <Show when={props.text.trim().length > 0}>
      <PostRichText class="m-0" facets={props.facets} text={props.text} />
    </Show>
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
      class="inline-flex min-w-0 items-center gap-1.5 rounded-full border-0 bg-transparent px-3 py-2 text-xs text-on-surface-variant transition duration-150 ease-out hover:-translate-y-px hover:bg-white/5 hover:text-primary disabled:cursor-wait disabled:opacity-70 max-[520px]:px-2.5"
      classList={{ "text-primary": !!props.active }}
      type="button"
      disabled={props.busy}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick?.();
      }}>
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
  return (
    <Show when={props.post.embed}>
      {(current) => (
        <div class="mt-4">
          <EmbedContent embed={current()} />
        </div>
      )}
    </Show>
  );
}

function EmbedContent(props: { embed: EmbedView }) {
  return (
    <Switch>
      <Match when={props.embed.$type === "app.bsky.embed.images#view"}>
        <ImageEmbed embed={props.embed as ImagesEmbedView} />
      </Match>
      <Match when={props.embed.$type === "app.bsky.embed.external#view"}>
        <ExternalEmbed
          description={(props.embed as { external: { description?: string } }).external.description}
          thumb={(props.embed as { external: { thumb?: string } }).external.thumb}
          title={(props.embed as { external: { title?: string } }).external.title}
          uri={(props.embed as { external: { uri?: string } }).external.uri} />
      </Match>
      <Match when={props.embed.$type === "app.bsky.embed.video#view"}>
        <ExternalEmbed
          description={(props.embed as { alt?: string }).alt}
          thumb={(props.embed as { thumbnail?: string }).thumbnail}
          title="Video attachment"
          uri={(props.embed as { playlist?: string }).playlist} />
      </Match>
      <Match when={props.embed.$type === "app.bsky.embed.record#view"}>
        <RecordEmbedContent embed={props.embed} />
      </Match>
      <Match when={props.embed.$type === "app.bsky.embed.recordWithMedia#view"}>
        <RecordWithMediaEmbedContent embed={props.embed} />
      </Match>
    </Switch>
  );
}

function RecordEmbedContent(props: { embed: EmbedView }) {
  return (
    <QuoteEmbed
      author={getQuotedAuthor(props.embed)}
      href={getQuotedHref(props.embed)}
      text={getQuotedText(props.embed)}
      title="Quoted post" />
  );
}

function RecordWithMediaEmbedContent(props: { embed: EmbedView }) {
  const media = () => ("media" in props.embed ? props.embed.media : null);

  return (
    <div class="grid gap-3">
      <Show when={media()}>{(current) => <EmbedContent embed={current() as EmbedView} />}</Show>
      <QuoteEmbed
        author={getQuotedAuthor(props.embed)}
        href={getQuotedHref(props.embed)}
        text={getQuotedText(props.embed)}
        title="Quoted post" />
    </div>
  );
}

function ImageEmbed(props: { embed: ImagesEmbedView }) {
  const images = createMemo(() => props.embed.images.slice(0, 4));
  return (
    <div class="grid min-w-0 gap-2" classList={{ "grid-cols-2": props.embed.images.length > 1 }}>
      <For each={images()}>
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
      class="grid min-w-0 gap-3 overflow-hidden rounded-2xl bg-black/30 p-3 text-inherit no-underline shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)] transition duration-150 ease-out hover:bg-black/40"
      href={props.uri}
      rel="noreferrer"
      target="_blank"
      onClick={(event) => event.stopPropagation()}>
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
            <p class="m-0 break-all text-xs uppercase tracking-[0.08em] text-primary">
              {uri().replace(/^https?:\/\//, "")}
            </p>
          )}
        </Show>
      </div>
    </a>
  );
}

function QuoteEmbed(props: { author: ProfileViewBasic | null; href?: string | null; text?: unknown; title: string }) {
  return <QuotedPostPreview author={props.author} href={props.href} text={props.text} title={props.title} />;
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("a, button, input, textarea, select, [role='menuitem']");
}
