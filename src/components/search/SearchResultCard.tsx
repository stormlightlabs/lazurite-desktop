import { formatRelativeTime } from "$/lib/feeds";
import { buildProfileRoute } from "$/lib/profile";
import { escapeForRegex } from "$/lib/utils/text";
import { createMemo, type JSX, type ParentProps, Show } from "solid-js";
import { Icon } from "../shared/Icon";

type CardContentProps = {
  avatarLabel: string;
  authorHandle: string;
  profileHref: string;
  time: string;
  isSemantic?: boolean;
  text: string | (string | JSX.Element)[];
  likes?: number;
  onOpenThread?: () => void;
  replies?: number;
  sourceLabel: string | null;
};

function CardContent(props: CardContentProps) {
  return (
    <div class="flex gap-3">
      <a class="shrink-0 no-underline" href={`#${props.profileHref}`} onClick={(event) => event.stopPropagation()}>
        <Avatar label={props.avatarLabel} />
      </a>
      <div class="min-w-0 flex-1">
        <PostPreviewRegion onOpenThread={props.onOpenThread}>
          <CardHeader
            handle={props.authorHandle}
            profileHref={props.profileHref}
            time={props.time}
            isSemantic={props.isSemantic} />
          <TextContent text={props.text} />
          <CardFooter
            likes={props.likes}
            onOpenThread={props.onOpenThread}
            replies={props.replies}
            sourceLabel={props.sourceLabel} />
        </PostPreviewRegion>
      </div>
    </div>
  );
}

function Avatar(props: { label: string }) {
  const base = "relative mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-full ";
  const gradient = "bg-[linear-gradient(135deg,rgba(125,175,255,0.9),rgba(0,115,222,0.72))] ";
  const shadow = "shadow-[0_0_0_2px_rgba(14,14,14,1),0_0_0_3px_rgba(125,175,255,0.28)]";

  return (
    <div class={base + gradient + shadow}>
      <div class="flex h-full w-full items-center justify-center text-sm font-semibold text-on-primary-fixed">
        {props.label}
      </div>
    </div>
  );
}

function CardHeader(props: { handle: string; profileHref: string; time: string; isSemantic?: boolean }) {
  return (
    <header class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <a
        class="wrap-break-word text-sm font-semibold text-on-surface no-underline transition hover:text-primary"
        href={`#${props.profileHref}`}
        onClick={(event) => event.stopPropagation()}>
        @{props.handle.replace(/^@/, "")}
      </a>
      <span class="text-xs text-on-surface-variant">{props.time}</span>
      <SemanticBadge isSemantic={props.isSemantic} />
    </header>
  );
}

function SemanticBadge(props: { isSemantic?: boolean }) {
  return (
    <Show when={props.isSemantic}>
      <span class="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">Semantic match</span>
    </Show>
  );
}

function TextContent(props: { text: string | (string | JSX.Element)[] }) {
  return (
    <p class="m-0 whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-on-secondary-container">
      {props.text}
    </p>
  );
}

function CardFooter(
  props: { likes?: number; onOpenThread?: () => void; replies?: number; sourceLabel: string | null },
) {
  return (
    <footer class="mt-3 flex min-w-0 flex-wrap items-center gap-3">
      <Show when={typeof props.likes === "number"}>
        <StatBadge kind="like" value={props.likes} label="likes" />
      </Show>

      <Show when={typeof props.replies === "number"}>
        <StatBadge kind="reply" value={props.replies} label="replies" />
      </Show>

      <Show when={props.sourceLabel}>
        {(label) => <span class="rounded-full bg-white/10 px-2 py-0.5 text-xs text-on-surface-variant">{label()}</span>}
      </Show>

      <Show when={props.onOpenThread}>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-medium text-primary">
          <Icon iconClass="i-ri-node-tree" class="text-sm" />
          Thread
        </span>
      </Show>
    </footer>
  );
}

function StatBadge(props: { kind: "like" | "reply"; value?: number; label: string }) {
  return (
    <span class="inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
      <Show when={props.kind === "like"} fallback={<Icon kind="quote" class="text-xs text-on-surface-variant" />}>
        <Icon kind="heart" class="text-xs text-on-surface-variant" />
      </Show>
      {props.value} {props.label}
    </span>
  );
}

function PostPreviewRegion(props: ParentProps<{ onOpenThread?: () => void }>) {
  const interactive = () => !!props.onOpenThread;

  return (
    <div
      class="min-w-0 rounded-2xl outline-none transition duration-150 ease-out"
      classList={{
        "cursor-pointer hover:bg-white/2.5 focus-visible:bg-white/3 focus-visible:ring-1 focus-visible:ring-primary/30":
          interactive(),
      }}
      aria-label={interactive() ? "Open thread" : undefined}
      role={interactive() ? "button" : undefined}
      tabIndex={interactive() ? 0 : undefined}
      onClick={() => props.onOpenThread?.()}
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

type SearchResultCardProps = {
  authorDid?: string;
  authorHandle: string;
  source: "like" | "bookmark" | "network";
  text: string;
  createdAt: string;
  likeCount?: number;
  onOpenThread?: () => void;
  replyCount?: number;
  isSemanticMatch?: boolean;
  query?: string;
};

export function SearchResultCard(props: SearchResultCardProps) {
  const avatarLabel = createMemo(() => props.authorHandle.slice(0, 1).toUpperCase() || "?");
  const formattedTime = createMemo(() => (props.createdAt ? formatRelativeTime(props.createdAt) : "Unknown date"));
  const profileHref = createMemo(() => buildProfileRoute(props.authorHandle || props.authorDid));

  const sourceLabel = createMemo(() => {
    switch (props.source) {
      case "like": {
        return "Liked";
      }
      case "bookmark": {
        return "Bookmarked";
      }
      default: {
        return null;
      }
    }
  });

  const highlightedText = createMemo(() => {
    if (!props.query || !props.text) {
      return props.text;
    }

    const tokens = [...new Set(props.query.split(/\s+/).map((token) => token.trim()).filter(Boolean))];
    if (tokens.length === 0) {
      return props.text;
    }

    const pattern = tokens.toSorted((left, right) => right.length - left.length).map((token) => escapeForRegex(token))
      .join("|");
    const parts = props.text.split(new RegExp(`(${pattern})`, "gi"));
    return parts.map((part) => {
      if (tokens.some((token) => token.toLowerCase() === part.toLowerCase())) {
        return <mark class="rounded bg-primary/20 px-0.5 text-primary">{part}</mark>;
      }
      return part;
    });
  });

  return (
    <article
      class="group rounded-2xl bg-surface px-5 py-4 transition-colors duration-150 hover:bg-white/3"
      role="article">
      <CardContent
        avatarLabel={avatarLabel()}
        authorHandle={props.authorHandle}
        profileHref={profileHref()}
        time={formattedTime()}
        isSemantic={props.isSemanticMatch}
        text={highlightedText()}
        likes={props.likeCount}
        onOpenThread={props.onOpenThread}
        replies={props.replyCount}
        sourceLabel={sourceLabel()} />
    </article>
  );
}
