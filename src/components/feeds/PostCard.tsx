import { useModerationDecision } from "$/components/moderation/hooks/useModerationDecision";
import { ModeratedAvatar } from "$/components/moderation/ModeratedAvatar";
import { ModeratedBlurOverlay } from "$/components/moderation/ModeratedBlurOverlay";
import { ModerationBadgeRow } from "$/components/moderation/ModerationBadgeRow";
import { ReportDialog } from "$/components/moderation/ReportDialog";
import { ContextMenu, type ContextMenuAnchor, type ContextMenuItem } from "$/components/shared/ContextMenu";
import { Icon } from "$/components/shared/Icon";
import { PostRichText } from "$/components/shared/PostRichText";
import { ModerationController } from "$/lib/api/moderation";
import {
  buildPublicPostUrl,
  getAvatarLabel,
  getDisplayName,
  getPostCreatedAt,
  getPostFacets,
  getPostText,
  hasKnownThreadContext,
} from "$/lib/feeds";
import { isReplyItem } from "$/lib/feeds/type-guards";
import { collectModerationLabels } from "$/lib/moderation";
import type { PostEngagementTab } from "$/lib/post-engagement-routes";
import { buildProfileRoute, getProfileRouteActor } from "$/lib/profile";
import type {
  EmbedView,
  FeedViewPost,
  ModerationLabel,
  ModerationReasonType,
  ModerationUiDecision,
  PostView,
  RichTextFacet,
} from "$/lib/types";
import { formatRelativeTime } from "$/lib/utils/text";
import { formatCount, formatHandle, normalizeError } from "$/lib/utils/text";
import * as logger from "@tauri-apps/plugin-log";
import { createMemo, createSignal, type ParentProps, Show, splitProps } from "solid-js";
import { Motion } from "solid-motionone";
import { EmbedContent } from "./embeds/ContentEmbed";
import type { ReportTarget } from "./types";

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("a, button, input, textarea, select, [role='menuitem']");
}

function isDecisionHidden(decision: ModerationUiDecision) {
  return decision.filter || decision.blur !== "none";
}

function mergeModerationDecisions(
  contentDecision: ModerationUiDecision,
  mediaDecision: ModerationUiDecision,
): ModerationUiDecision {
  return {
    alert: contentDecision.alert || mediaDecision.alert,
    blur: contentDecision.blur !== "none" ? contentDecision.blur : mediaDecision.blur,
    filter: contentDecision.filter || mediaDecision.filter,
    inform: contentDecision.inform || mediaDecision.inform,
    noOverride: contentDecision.noOverride || mediaDecision.noOverride,
  };
}

function PostHeader(props: { authorHandle: string; authorHref: string; authorName: string; createdAt: string }) {
  return (
    <header class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span class="wrap-break-word text-base font-semibold tracking-[-0.01em] text-on-surface">{props.authorName}</span>
      <a
        class="break-all text-xs text-primary no-underline transition hover:underline"
        href={`#${props.authorHref}`}
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
        "cursor-pointer hover:bg-surface-bright focus-visible:bg-surface-bright focus-visible:ring-1 focus-visible:ring-primary/30":
          interactive(),
      }}
      aria-label={interactive() ? "Open thread" : undefined}
      role={interactive() ? "button" : undefined}
      tabIndex={interactive() ? 0 : undefined}
      onClick={(event) => {
        if (isInteractiveTarget(event.target)) {
          return;
        }

        props.onOpenThread?.();
      }}
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
  ariaExpanded?: boolean;
  ariaHasPopup?: "menu";
  ariaLabel?: string;
  busy?: boolean;
  icon: string;
  iconActive?: string;
  label: string;
  onClick?: (event: MouseEvent) => void;
  pulse?: boolean;
};

function PostActionButton(props: PostActionButtonProps) {
  return (
    <button
      aria-expanded={props.ariaExpanded}
      aria-haspopup={props.ariaHasPopup}
      aria-label={props.ariaLabel ?? props.label}
      class="inline-flex min-w-0 items-center gap-1.5 rounded-full border-0 bg-transparent px-3 py-2 text-xs text-on-surface-variant transition duration-150 ease-out hover:-translate-y-px hover:bg-surface-bright hover:text-primary disabled:cursor-wait disabled:opacity-70 max-[520px]:px-2.5"
      classList={{ "text-primary": !!props.active }}
      type="button"
      disabled={props.busy}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick?.(event);
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

type PostActionStatus = {
  bookmarkPending: boolean;
  isBookmarked: boolean;
  isLiked: boolean;
  isReposted: boolean;
  likeCount: string;
  likePending: boolean;
  pulseLike: boolean;
  pulseRepost: boolean;
  quoteCount: string;
  replyCount: string;
  repostCount: string;
  repostPending: boolean;
};

type PostActionHandlers = {
  onBookmark?: (event: MouseEvent) => void;
  onLike?: (event: MouseEvent) => void;
  onOpenEngagement?: (tab: PostEngagementTab) => void;
  onOpenThread?: () => void;
  onQuote?: (event: MouseEvent) => void;
  onReply?: (event: MouseEvent) => void;
  onRepost?: (event: MouseEvent) => void;
};

type PostActionsProps = {
  handlers: PostActionHandlers;
  menu: {
    open: boolean;
    onOpen: (element: HTMLButtonElement) => void;
    triggerRef: (element: HTMLButtonElement) => void;
  };
  repostMenuOpen: boolean;
  showThreadAction: boolean;
  state: PostActionStatus;
};

function PostActions(props: PostActionsProps) {
  const [status, menu, actions, visibility] = splitProps(props, ["state"], ["menu"], ["handlers"], [
    "repostMenuOpen",
    "showThreadAction",
  ]);

  return (
    <footer class="mt-4 flex min-w-0 flex-wrap items-center gap-2 max-[520px]:gap-1">
      <PostActionButton
        active={status.state.isLiked}
        ariaLabel="Like"
        busy={status.state.likePending}
        icon="i-ri-heart-3-line"
        iconActive="i-ri-heart-3-fill"
        label={status.state.likeCount}
        pulse={status.state.pulseLike}
        onClick={actions.handlers.onLike} />
      <PostActionButton
        ariaLabel="Reply"
        icon="i-ri-chat-1-line"
        label={status.state.replyCount}
        onClick={actions.handlers.onReply} />
      <PostActionButton
        active={status.state.isReposted}
        ariaExpanded={visibility.repostMenuOpen}
        ariaHasPopup="menu"
        ariaLabel="Repost"
        busy={status.state.repostPending}
        icon="i-ri-repeat-2-line"
        iconActive="i-ri-repeat-2-fill"
        label={status.state.repostCount}
        pulse={status.state.pulseRepost}
        onClick={actions.handlers.onRepost} />
      <PostActionButton
        active={status.state.isBookmarked}
        ariaLabel={status.state.isBookmarked ? "Unsave" : "Save"}
        busy={status.state.bookmarkPending}
        icon="i-ri-bookmark-line"
        iconActive="i-ri-bookmark-fill"
        label={status.state.isBookmarked ? "Saved" : "Save"}
        onClick={actions.handlers.onBookmark} />
      <PostActionButton
        ariaLabel="Quote"
        icon="i-ri-chat-quote-line"
        label={status.state.quoteCount}
        onClick={actions.handlers.onQuote} />
      <Show when={visibility.showThreadAction}>
        <PostActionButton icon="i-ri-node-tree" label="Thread" onClick={actions.handlers.onOpenThread} />
      </Show>
      <button
        aria-label="More actions"
        ref={(element) => menu.menu.triggerRef(element)}
        aria-expanded={menu.menu.open}
        aria-haspopup="menu"
        class="inline-flex items-center justify-center rounded-full border-0 bg-transparent px-3 py-2 text-xs text-on-surface-variant transition duration-150 ease-out hover:-translate-y-px hover:bg-surface-bright hover:text-primary max-[520px]:px-2.5"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          menu.menu.onOpen(event.currentTarget);
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

function PostEmbedContent(
  props: { embed: EmbedView; onOpenPost?: (uri: string) => void; post: PostView; withTopMargin?: boolean },
) {
  return (
    <div classList={{ "mt-4": !!props.withTopMargin }}>
      <EmbedContent embed={props.embed} onOpenPost={props.onOpenPost} post={props.post} />
    </div>
  );
}

function PostModeratedContent(
  props: {
    contentDecision: ModerationUiDecision;
    contentLabels: ModerationLabel[];
    hasPostText: boolean;
    mediaDecision: ModerationUiDecision;
    mediaLabels: ModerationLabel[];
    mergeBodyAndEmbedModeration: boolean;
    mergedPostDecision: ModerationUiDecision;
    onOpenPost?: (uri: string) => void;
    post: PostView;
    text: string;
  },
) {
  return (
    <Show
      when={props.mergeBodyAndEmbedModeration}
      fallback={
        <>
          <ModeratedPostBody
            decision={props.contentDecision}
            labels={props.contentLabels}
            post={props.post}
            text={props.text} />

          <Show when={props.post.embed}>
            {(current) => (
              <ModeratedBlurOverlay decision={props.mediaDecision} labels={props.mediaLabels} class="mt-4">
                <PostEmbedContent embed={current()} onOpenPost={props.onOpenPost} post={props.post} />
              </ModeratedBlurOverlay>
            )}
          </Show>
        </>
      }>
      <ModeratedBlurOverlay decision={props.mergedPostDecision} labels={props.mediaLabels} class="mt-3">
        <PostBodyText facets={getPostFacets(props.post)} text={props.text} />
        <Show when={props.post.embed}>
          {(current) => (
            <PostEmbedContent
              embed={current()}
              onOpenPost={props.onOpenPost}
              post={props.post}
              withTopMargin={props.hasPostText} />
          )}
        </Show>
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
  onOpenEngagement?: (tab: PostEngagementTab) => void;
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
  const [view, interactions, actionFlags] = splitProps(
    props,
    ["focused", "item", "post", "registerRef", "showActions"],
    ["onBookmark", "onFocus", "onLike", "onOpenEngagement", "onOpenThread", "onQuote", "onReply", "onRepost"],
    ["bookmarkPending", "likePending", "pulseLike", "pulseRepost", "repostPending"],
  );

  const authorName = createMemo(() => getDisplayName(view.post.author));
  const createdAt = createMemo(() => formatRelativeTime(getPostCreatedAt(view.post)));
  const isBookmarked = createMemo(() => !!view.post.viewer?.bookmarked);
  const isLiked = createMemo(() => !!view.post.viewer?.like);
  const isReposted = createMemo(() => !!view.post.viewer?.repost);
  const likeCount = createMemo(() => formatCount(view.post.likeCount));
  const postText = createMemo(() => getPostText(view.post));
  const quoteCount = createMemo(() => formatCount(view.post.quoteCount));
  const replyCount = createMemo(() => formatCount(view.post.replyCount));
  const repostCount = createMemo(() => formatCount(view.post.repostCount));
  const authorHandle = createMemo(() => formatHandle(view.post.author.handle, view.post.author.did));
  const profileHref = createMemo(() => buildProfileRoute(getProfileRouteActor(view.post.author)));
  const contentLabels = () => collectModerationLabels(view.post);
  const mediaLabels = () => collectModerationLabels(view.post, view.post.embed);
  const authorLabels = () => collectModerationLabels(view.post.author);
  const contentDecision = useModerationDecision(contentLabels, "contentList");
  const mediaDecision = useModerationDecision(mediaLabels, "contentMedia");
  const avatarDecision = useModerationDecision(authorLabels, "avatar");
  const authorDecision = useModerationDecision(authorLabels, "profileList");
  const contentHidden = createMemo(() => isDecisionHidden(contentDecision()));
  const mediaHidden = createMemo(() => isDecisionHidden(mediaDecision()));
  const mergeBodyAndEmbedModeration = createMemo(() => contentHidden() && mediaHidden());
  const mergedPostDecision = createMemo(() => mergeModerationDecisions(contentDecision(), mediaDecision()));
  const hasPostText = createMemo(() => postText().trim().length > 0);
  const showThreadAction = createMemo(() => hasKnownThreadContext(view.post, view.item));
  const reasonLabel = createMemo(() => {
    const reason = view.item?.reason;
    if (!reason || reason.$type !== "app.bsky.feed.defs#reasonRepost") {
      return null;
    }

    return `${getDisplayName(reason.by)} reposted`;
  });

  const replyLabel = createMemo(() => {
    const item = view.item;
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
  const [repostMenuAnchor, setRepostMenuAnchor] = createSignal<ContextMenuAnchor | null>(null);
  const [repostMenuOpen, setRepostMenuOpen] = createSignal(false);
  const [reportOpen, setReportOpen] = createSignal(false);
  const [reportTarget, setReportTarget] = createSignal<ReportTarget | null>(null);
  let menuTriggerRef: HTMLButtonElement | undefined;
  let repostMenuTriggerRef: HTMLButtonElement | undefined;

  const menuItems = createMemo<ContextMenuItem[]>(() => {
    const items: ContextMenuItem[] = [];

    if (interactions.onReply) {
      items.push({ icon: "i-ri-chat-1-line", label: "Reply", onSelect: interactions.onReply });
    }

    if (interactions.onQuote) {
      items.push({ icon: "i-ri-chat-quote-line", label: "Quote", onSelect: interactions.onQuote });
    }

    if (interactions.onLike) {
      items.push({
        icon: isLiked() ? "i-ri-heart-3-fill" : "i-ri-heart-3-line",
        label: isLiked() ? "Unlike" : "Like",
        onSelect: interactions.onLike,
      });
    }

    if (interactions.onRepost) {
      items.push({
        icon: isReposted() ? "i-ri-repeat-2-fill" : "i-ri-repeat-2-line",
        label: isReposted() ? "Undo repost" : "Repost",
        onSelect: interactions.onRepost,
      });
    }

    if (interactions.onBookmark) {
      items.push({
        icon: isBookmarked() ? "i-ri-bookmark-fill" : "i-ri-bookmark-line",
        label: isBookmarked() ? "Unsave" : "Save",
        onSelect: interactions.onBookmark,
      });
    }

    items.push({
      icon: "i-ri-link-m",
      label: "Copy post link",
      onSelect: () => void navigator.clipboard?.writeText(buildPublicPostUrl(view.post)),
    });

    if (interactions.onOpenThread && showThreadAction()) {
      items.push({ icon: "i-ri-node-tree", label: "Open thread", onSelect: interactions.onOpenThread });
    }

    if (interactions.onOpenEngagement) {
      items.push({
        icon: "i-ri-heart-3-line",
        label: `${formatCount(view.post.likeCount)} ${view.post.likeCount === 1 ? "like" : "likes"}`,
        onSelect: () => interactions.onOpenEngagement?.("likes"),
      }, {
        icon: "i-ri-repeat-2-line",
        label: `${formatCount(view.post.repostCount)} ${view.post.repostCount === 1 ? "repost" : "reposts"}`,
        onSelect: () => interactions.onOpenEngagement?.("reposts"),
      }, {
        icon: "i-ri-chat-quote-line",
        label: `${formatCount(view.post.quoteCount)} ${view.post.quoteCount === 1 ? "quote" : "quotes"}`,
        onSelect: () => interactions.onOpenEngagement?.("quotes"),
      });
    }

    items.push({
      icon: "i-ri-flag-line",
      label: "Report post",
      onSelect: () => {
        setReportTarget({
          subject: { type: "record", uri: view.post.uri, cid: view.post.cid },
          subjectLabel: `Post by @${view.post.author.handle}`,
        });
        setReportOpen(true);
      },
    }, {
      icon: "i-ri-flag-2-line",
      label: "Report account",
      onSelect: () => {
        setReportTarget({
          subject: { type: "repo", did: view.post.author.did },
          subjectLabel: `Account @${view.post.author.handle}`,
        });
        setReportOpen(true);
      },
    }, { icon: "i-ri-forbid-2-line", label: `Block @${view.post.author.handle}`, onSelect: () => void blockAuthor() });

    return items;
  });

  const repostMenuItems = createMemo<ContextMenuItem[]>(() => {
    const items: ContextMenuItem[] = [];

    if (interactions.onRepost) {
      items.push({
        icon: isReposted() ? "i-ri-repeat-2-fill" : "i-ri-repeat-2-line",
        label: isReposted() ? "Undo repost" : "Repost",
        onSelect: interactions.onRepost,
      });
    }

    if (interactions.onQuote) {
      items.push({ icon: "i-ri-chat-quote-line", label: "Quote post", onSelect: interactions.onQuote });
    }

    return items;
  });

  function closeContextMenu() {
    setMenuOpen(false);
    setMenuAnchor(null);
  }

  function closeRepostMenu() {
    setRepostMenuOpen(false);
    setRepostMenuAnchor(null);
  }

  function openContextMenuFromTrigger(element: HTMLButtonElement) {
    closeRepostMenu();
    setMenuAnchor({ kind: "element", rect: element.getBoundingClientRect() });
    setMenuOpen(true);
  }

  function openContextMenuFromPointer(event: MouseEvent) {
    event.preventDefault();
    closeRepostMenu();
    setMenuAnchor({ kind: "point", x: event.clientX, y: event.clientY });
    setMenuOpen(true);
  }

  function openRepostMenuFromTrigger(element: HTMLButtonElement) {
    if (repostMenuItems().length === 0) {
      return;
    }

    closeContextMenu();
    repostMenuTriggerRef = element;
    setRepostMenuAnchor({ kind: "element", rect: element.getBoundingClientRect() });
    setRepostMenuOpen(true);
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
      ? globalThis.confirm(`Block @${view.post.author.handle}? You can unblock from Bluesky settings.`)
      : true;

    if (!confirmed) {
      return;
    }

    try {
      await ModerationController.blockActor(view.post.author.did);
    } catch (error) {
      logger.error("failed to block account", { keyValues: { error: normalizeError(error) } });
    }
  }

  return (
    <article
      ref={(element) => view.registerRef?.(element)}
      class="tone-muted group min-w-0 overflow-hidden rounded-3xl px-4 py-4 shadow-(--inset-shadow) transition duration-150 ease-out hover:bg-surface-bright max-[760px]:px-3.5 max-[760px]:py-3.5 max-[520px]:rounded-3xl max-[520px]:px-3 max-[520px]:py-3"
      classList={{
        "bg-[linear-gradient(135deg,rgba(125,175,255,0.11),rgba(0,115,222,0.06))] shadow-[inset_0_0_0_1px_rgba(125,175,255,0.22),0_0_0_1px_rgba(125,175,255,0.08)]":
          !!view.focused,
      }}
      role="article"
      onContextMenu={(event) => {
        if (menuItems().length === 0 || isInteractiveTarget(event.target)) {
          return;
        }

        openContextMenuFromPointer(event);
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
        <div class="shrink-0">
          <a
            aria-label={`View @${view.post.author.handle}`}
            class="no-underline"
            href={`#${profileHref()}`}
            onClick={(event) => event.stopPropagation()}>
            <ModeratedAvatar
              avatar={view.post.author.avatar}
              class="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[linear-gradient(135deg,rgba(125,175,255,0.9),rgba(0,115,222,0.72))] shadow-[0_0_0_2px_var(--surface-container),0_0_0_3px_rgba(125,175,255,0.28)]"
              hidden={avatarDecision().filter || avatarDecision().blur !== "none"}
              label={getAvatarLabel(view.post.author)}
              fallbackClass="text-sm font-semibold text-on-primary-fixed" />
          </a>
        </div>

        <div class="min-w-0 flex-1">
          <PostPrimaryRegion onFocus={interactions.onFocus} onOpenThread={interactions.onOpenThread}>
            <PostHeader
              authorName={authorName()}
              authorHandle={authorHandle()}
              authorHref={profileHref()}
              createdAt={createdAt()} />

            <ModerationBadgeRow decision={authorDecision()} labels={authorLabels()} />

            <ModerationBadgeRow decision={contentDecision()} labels={contentLabels()} />

            <PostModeratedContent
              contentDecision={contentDecision()}
              contentLabels={contentLabels()}
              hasPostText={hasPostText()}
              mediaDecision={mediaDecision()}
              mediaLabels={mediaLabels()}
              mergeBodyAndEmbedModeration={mergeBodyAndEmbedModeration()}
              mergedPostDecision={mergedPostDecision()}
              onOpenPost={interactions.onOpenThread}
              post={view.post}
              text={postText()} />
          </PostPrimaryRegion>

          <Show when={view.showActions !== false}>
            <PostActions
              handlers={{
                onBookmark: () => interactions.onBookmark?.(),
                onLike: (event) => {
                  if (event.shiftKey && interactions.onOpenEngagement) {
                    interactions.onOpenEngagement("likes");
                    return;
                  }

                  interactions.onLike?.();
                },
                onOpenThread: interactions.onOpenThread,
                onQuote: (event) => {
                  if (event.shiftKey && interactions.onOpenEngagement) {
                    interactions.onOpenEngagement("quotes");
                    return;
                  }

                  interactions.onQuote?.();
                },
                onReply: () => interactions.onReply?.(),
                onRepost: (event) => {
                  if (event.shiftKey) {
                    interactions.onRepost?.();
                    return;
                  }

                  openRepostMenuFromTrigger(event.currentTarget as HTMLButtonElement);
                },
              }}
              menu={{
                open: menuOpen(),
                onOpen: openContextMenuFromTrigger,
                triggerRef: (element) => {
                  menuTriggerRef = element;
                },
              }}
              repostMenuOpen={repostMenuOpen()}
              showThreadAction={showThreadAction()}
              state={{
                bookmarkPending: !!actionFlags.bookmarkPending,
                isBookmarked: isBookmarked(),
                isLiked: isLiked(),
                isReposted: isReposted(),
                likeCount: likeCount(),
                likePending: !!actionFlags.likePending,
                pulseLike: !!actionFlags.pulseLike,
                pulseRepost: !!actionFlags.pulseRepost,
                quoteCount: quoteCount(),
                replyCount: replyCount(),
                repostCount: repostCount(),
                repostPending: !!actionFlags.repostPending,
              }} />
          </Show>
        </div>
      </div>

      <ContextMenu
        anchor={menuAnchor()}
        items={menuItems()}
        label="Post actions"
        open={menuOpen()}
        returnFocusTo={menuTriggerRef}
        onClose={closeContextMenu} />

      <ContextMenu
        anchor={repostMenuAnchor()}
        items={repostMenuItems()}
        label="Repost actions"
        open={repostMenuOpen()}
        returnFocusTo={repostMenuTriggerRef}
        onClose={closeRepostMenu} />

      <ReportDialog
        open={reportOpen()}
        subjectLabel={reportTarget()?.subjectLabel ?? "Report content"}
        onClose={() => setReportOpen(false)}
        onSubmit={submitReport} />
    </article>
  );
}
