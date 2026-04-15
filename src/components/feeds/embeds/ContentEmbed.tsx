import { QuotedPostPreview } from "$/components/shared/QuotedPostPreview";
import { normalizeEmbed, postRkeyFromUri } from "$/lib/feeds";
import type { NormalizedEmbed, QuotedRecordPresentation } from "$/lib/feeds";
import { isNormalizedEmbed } from "$/lib/feeds/type-guards";
import { buildPostRoute } from "$/lib/post-routes";
import type { EmbedView, PostView } from "$/lib/types";
import { createMemo, For, type JSX, Show } from "solid-js";
import { ExternalEmbed } from "./ExternalEmbed";
import { ImageEmbed } from "./ImageEmbed";
import { VideoEmbed } from "./VideoEmbed";

const MAX_EMBED_DEPTH = 3;

function RecognizedEmbedNotice(props: { message: string }) {
  return (
    <div class="ui-input-strong rounded-2xl p-4 shadow-(--inset-shadow)">
      <p class="m-0 text-sm leading-[1.55] text-on-surface-variant">{props.message}</p>
    </div>
  );
}

function RenderQuotedPreview(
  props: { quoted: QuotedRecordPresentation; depth: number; post: PostView; onOpenPost?: (uri: string) => void },
) {
  const quotedExternalHref = createMemo(() => props.quoted.href);
  const quotedUri = createMemo(() => props.quoted.uri);
  const quotedInternalHref = createMemo(() => {
    const uri = quotedUri();
    return uri ? `#${buildPostRoute(uri)}` : null;
  });
  const quotedHref = createMemo(() => quotedInternalHref() ?? quotedExternalHref());

  const openQuotedPost = () => {
    const uri = quotedUri();
    if (!uri || !props.onOpenPost) {
      return;
    }

    props.onOpenPost(uri);
  };

  const quotedPostForEmbeds = createMemo<PostView | null>(() => {
    const value = props.quoted;
    if (value.kind !== "post" || !value.uri) {
      return null;
    }

    return {
      author: value.author ?? props.post.author,
      cid: "",
      indexedAt: props.post.indexedAt,
      record: { createdAt: props.post.indexedAt, facets: value.facets ?? [], text: value.text ?? "" },
      uri: value.uri,
    };
  });

  return (
    <QuotedPostPreview
      author={props.quoted.author}
      emptyText={props.quoted.emptyText}
      facets={props.quoted.facets}
      href={quotedHref()}
      onOpenPost={quotedUri() && props.onOpenPost ? openQuotedPost : undefined}
      text={props.quoted.text}
      title={props.quoted.title}>
      <Show when={quotedPostForEmbeds()}>
        {(quotedPost) => (
          <Show when={props.quoted.normalizedEmbeds.length > 0}>
            <For each={props.quoted.normalizedEmbeds}>
              {(embed) => (
                <EmbedContent depth={props.depth + 1} embed={embed} onOpenPost={props.onOpenPost} post={quotedPost()} />
              )}
            </For>
          </Show>
        )}
      </Show>
    </QuotedPostPreview>
  );
}

export function EmbedContent(
  props: { depth?: number; embed: EmbedView | NormalizedEmbed; onOpenPost?: (uri: string) => void; post: PostView },
) {
  const depth = createMemo(() => props.depth ?? 0);
  const normalized = createMemo<NormalizedEmbed>(() =>
    isNormalizedEmbed(props.embed) ? props.embed : normalizeEmbed(props.embed, { depth: depth(), source: "top" })
  );
  const postRkey = createMemo(() => postRkeyFromUri(props.post.uri));

  const content = createMemo<JSX.Element | null>(() => {
    const embed = normalized();
    if (depth() >= MAX_EMBED_DEPTH || embed.meta.depthLimited) {
      return <RecognizedEmbedNotice message="Embed nesting limit reached." />;
    }
    if (embed.meta.cycle) {
      return <RecognizedEmbedNotice message="Embed cycle detected." />;
    }

    switch (embed.kind) {
      case "images": {
        return <ImageEmbed embed={embed.embed} post={props.post} />;
      }
      case "external": {
        return (
          <ExternalEmbed
            description={embed.embed.external.description}
            thumb={embed.embed.external.thumb}
            title={embed.embed.external.title}
            uri={embed.embed.external.uri} />
        );
      }
      case "video": {
        return (
          <VideoEmbed
            alt={embed.embed.alt}
            aspectRatio={embed.embed.aspectRatio}
            downloadFilename={postRkey() ?? undefined}
            playlist={embed.embed.playlist}
            thumbnail={embed.embed.thumbnail} />
        );
      }
      case "record": {
        return (
          <RenderQuotedPreview depth={depth()} post={props.post} quoted={embed.quoted} onOpenPost={props.onOpenPost} />
        );
      }
      case "recordWithMedia": {
        return (
          <div class="grid gap-3">
            <Show when={embed.media}>
              {(mediaEmbed) => (
                <EmbedContent
                  depth={depth() + 1}
                  embed={mediaEmbed()}
                  onOpenPost={props.onOpenPost}
                  post={props.post} />
              )}
            </Show>
            <RenderQuotedPreview
              depth={depth()}
              post={props.post}
              quoted={embed.quoted}
              onOpenPost={props.onOpenPost} />
          </div>
        );
      }
      default: {
        return null;
      }
    }
  });

  return <>{content()}</>;
}
