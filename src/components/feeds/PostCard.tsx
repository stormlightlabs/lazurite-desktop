import { ModeratedAvatar } from "$/components/moderation/ModeratedAvatar";
import { ModeratedBlurOverlay } from "$/components/moderation/ModeratedBlurOverlay";
import { ModerationBadgeRow } from "$/components/moderation/ModerationBadgeRow";
import { ReportDialog } from "$/components/moderation/ReportDialog";
import { useModerationDecision } from "$/components/moderation/useModerationDecision";
import { ContextMenu, type ContextMenuAnchor, type ContextMenuItem } from "$/components/shared/ContextMenu";
import { Icon } from "$/components/shared/Icon";
import { PostRichText } from "$/components/shared/PostRichText";
import { ModerationController } from "$/lib/api/moderation";
import {
  buildPublicPostUrl,
  formatRelativeTime,
  getAvatarLabel,
  getDisplayName,
  getPostCreatedAt,
  getPostFacets,
  getPostText,
  isReplyItem,
} from "$/lib/feeds";
import { collectModerationLabels } from "$/lib/moderation";
import { buildProfileRoute, getProfileRouteActor } from "$/lib/profile";
import type {
  FeedViewPost,
  ModerationLabel,
  ModerationReasonType,
  ModerationUiDecision,
  PostView,
  RichTextFacet,
} from "$/lib/types";
import { formatCount, formatHandle, normalizeError } from "$/lib/utils/text";
import * as logger from "@tauri-apps/plugin-log";
import { createMemo, createSignal, type ParentProps, Show } from "solid-js";
import { Motion } from "solid-motionone";
import { EmbedContent } from "./embeds/ContentEmbed";
import type { ReportTarget } from "./types";

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("a, button, input, textarea, select, [role='menuitem']");
}

function PostHeader(props: { authorHandle: string; authorName: string; createdAt: string; profileHref: string }) {
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
        {props.authorHandle}
      </a>
      <span class="text-xs text-on-surface-variant">{props.createdAt}</span>
    </header>
  );
}

function PostPrimaryRegion(props: ParentProps<{ onFocus?: () => void; onOpenThread?: () => void }>) {
  const interactive = () => !!props.onOpenThread;

  return (
    <div
      class="min-w-0 rounded-2xl p-2 outline-none transition duration-150 ease-out"
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

type PostActionButtonProps = {
  active?: boolean;
  busy?: boolean;
  icon: string;
  iconActive?: string;
  label: string;
  onClick?: () => void;
  pulse?: boolean;
};

function PostActionButton(props: PostActionButtonProps) {
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

// FIXME: this is an absurdly large number of props
type PostActionsProps = {
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
};

function PostActions(props: PostActionsProps) {
  return (
    <footer class="mt-4 flex min-w-0 flex-wrap items-center gap-2 max-[520px]:gap-1">
      <PostActionButton
        active={props.isLiked}
        busy={props.likePending}
        icon="i-ri-heart-3-line"
        iconActive="i-ri-heart-3-fill"
        label={props.likeCount}
        pulse={props.pulseLike}
        onClick={props.onLike} />
      <PostActionButton icon="i-ri-chat-1-line" label={props.replyCount} onClick={props.onReply} />
      <PostActionButton
        active={props.isReposted}
        busy={props.repostPending}
        icon="i-ri-repeat-2-line"
        iconActive="i-ri-repeat-2-fill"
        label={props.repostCount}
        pulse={props.pulseRepost}
        onClick={props.onRepost} />
      <PostActionButton
        active={props.isBookmarked}
        busy={props.bookmarkPending}
        icon="i-ri-bookmark-line"
        iconActive="i-ri-bookmark-fill"
        label={props.isBookmarked ? "Saved" : "Save"}
        onClick={props.onBookmark} />
      <PostActionButton icon="i-ri-chat-quote-line" label="Quote" onClick={props.onQuote} />
      <PostActionButton icon="i-ri-node-tree" label="Thread" onClick={props.onOpenThread} />
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

function PostBodyText(props: { facets: RichTextFacet[]; text: string }) {
  return (
    <Show when={props.text.trim().length > 0}>
      <PostRichText class="m-0" facets={props.facets} text={props.text} />
    </Show>
  );
}

function ModeratedPostBody(
  props: { decision: ModerationUiDecision; labels: ModerationLabel[]; post: PostView; text: string },
) {
  return (
    <Show when={props.text.trim().length > 0}>
      <ModeratedBlurOverlay decision={props.decision} labels={props.labels} class="mt-3">
        <PostBodyText facets={getPostFacets(props.post)} text={props.text} />
      </ModeratedBlurOverlay>
    </Show>
  );
}

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
  const authorHandle = createMemo(() => formatHandle(props.post.author.handle, props.post.author.did));
  const profileHref = createMemo(() => buildProfileRoute(getProfileRouteActor(props.post.author)));
  const contentLabels = () => collectModerationLabels(props.post);
  const mediaLabels = () => collectModerationLabels(props.post, props.post.embed);
  const avatarLabels = () => collectModerationLabels(props.post.author);
  const contentDecision = useModerationDecision(contentLabels);
  const mediaDecision = useModerationDecision(mediaLabels);
  const avatarDecision = useModerationDecision(avatarLabels);
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
      return `Replying to ${formatHandle(parent.author.handle, parent.author.did)}`;
    }

    return "Reply in thread";
  });

  const [menuAnchor, setMenuAnchor] = createSignal<ContextMenuAnchor | null>(null);
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [reportOpen, setReportOpen] = createSignal(false);
  const [reportTarget, setReportTarget] = createSignal<ReportTarget | null>(null);
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

    items.push({
      icon: "i-ri-flag-line",
      label: "Report post",
      onSelect: () => {
        setReportTarget({
          subject: { type: "record", uri: props.post.uri, cid: props.post.cid },
          subjectLabel: `Post by @${props.post.author.handle}`,
        });
        setReportOpen(true);
      },
    }, {
      icon: "i-ri-flag-2-line",
      label: "Report account",
      onSelect: () => {
        setReportTarget({
          subject: { type: "repo", did: props.post.author.did },
          subjectLabel: `Account @${props.post.author.handle}`,
        });
        setReportOpen(true);
      },
    }, { icon: "i-ri-forbid-2-line", label: `Block @${props.post.author.handle}`, onSelect: () => void blockAuthor() });

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

  async function submitReport(input: { reasonType: ModerationReasonType; reason: string }) {
    const target = reportTarget();
    if (!target) {
      return;
    }

    try {
      await ModerationController.createReport(target.subject, input.reasonType, input.reason);
    } catch (error) {
      logger.error("failed to submit report", { keyValues: { error: normalizeError(error) } });
    }
  }

  async function blockAuthor() {
    const confirmed = globalThis.confirm
      ? globalThis.confirm(`Block @${props.post.author.handle}? You can unblock from Bluesky settings.`)
      : true;

    if (!confirmed) {
      return;
    }

    try {
      await ModerationController.blockActor(props.post.author.did);
    } catch (error) {
      logger.error("failed to block account", { keyValues: { error: normalizeError(error) } });
    }
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
          <ModeratedAvatar
            avatar={props.post.author.avatar}
            class="relative mt-0.5 h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[linear-gradient(135deg,rgba(125,175,255,0.9),rgba(0,115,222,0.72))] shadow-[0_0_0_2px_rgba(14,14,14,1),0_0_0_3px_rgba(125,175,255,0.28)]"
            hidden={avatarDecision().filter || avatarDecision().blur !== "none"}
            label={getAvatarLabel(props.post.author)}
            fallbackClass="text-sm font-semibold text-on-primary-fixed" />
        </a>

        <div class="min-w-0 flex-1">
          <PostPrimaryRegion onFocus={props.onFocus} onOpenThread={props.onOpenThread}>
            <PostHeader
              authorName={authorName()}
              authorHandle={authorHandle()}
              createdAt={createdAt()}
              profileHref={profileHref()} />

            <ModerationBadgeRow decision={contentDecision()} labels={contentLabels()} />

            <ModeratedPostBody
              decision={contentDecision()}
              labels={contentLabels()}
              post={props.post}
              text={postText()} />

            <Show when={props.post.embed}>
              {(current) => (
                <ModeratedBlurOverlay decision={mediaDecision()} labels={mediaLabels()} class="mt-4">
                  <EmbedContent embed={current()} post={props.post} />
                </ModeratedBlurOverlay>
              )}
            </Show>
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

      <ReportDialog
        open={reportOpen()}
        subjectLabel={reportTarget()?.subjectLabel ?? "Report content"}
        onClose={() => setReportOpen(false)}
        onSubmit={submitReport} />
    </article>
  );
}
