import { QuotedPostPreview } from "$/components/shared/QuotedPostPreview";
import { getQuotedAuthor, getQuotedHref, getQuotedText, getQuotedUri, postRkeyFromUri } from "$/lib/feeds";
import { buildPostRoute } from "$/lib/post-routes";
import type { EmbedView, ImagesEmbedView, PostView } from "$/lib/types";
import { createMemo, Match, Show, Switch } from "solid-js";
import { ExternalEmbed } from "./ExternalEmbed";
import { ImageEmbed } from "./ImageEmbed";
import { VideoEmbed } from "./VideoEmbed";

export function EmbedContent(props: { embed: EmbedView; onOpenPost?: (uri: string) => void; post: PostView }) {
  const postRkey = createMemo(() => postRkeyFromUri(props.post.uri));
  const media = () => ("media" in props.embed ? props.embed.media : null);
  const quotedUri = createMemo(() => getQuotedUri(props.embed));
  const quotedInternalHref = createMemo(() => {
    const uri = quotedUri();
    return uri ? `#${buildPostRoute(uri)}` : null;
  });
  const quotedExternalHref = createMemo(() => getQuotedHref(props.embed));
  const openQuotedPost = () => {
    const uri = quotedUri();
    if (!uri || !props.onOpenPost) {
      return;
    }

    props.onOpenPost(uri);
  };

  return (
    <Switch>
      <Match when={props.embed.$type === "app.bsky.embed.images#view"}>
        <ImageEmbed embed={props.embed as ImagesEmbedView} post={props.post} />
      </Match>
      <Match when={props.embed.$type === "app.bsky.embed.external#view"}>
        <ExternalEmbed
          description={(props.embed as { external: { description?: string } }).external.description}
          thumb={(props.embed as { external: { thumb?: string } }).external.thumb}
          title={(props.embed as { external: { title?: string } }).external.title}
          uri={(props.embed as { external: { uri?: string } }).external.uri} />
      </Match>
      <Match when={props.embed.$type === "app.bsky.embed.video#view"}>
        <VideoEmbed
          alt={(props.embed as { alt?: string }).alt}
          aspectRatio={(props.embed as { aspectRatio?: { height: number; width: number } }).aspectRatio}
          downloadFilename={postRkey() ?? undefined}
          playlist={(props.embed as { playlist?: string }).playlist}
          thumbnail={(props.embed as { thumbnail?: string }).thumbnail} />
      </Match>
      <Match when={props.embed.$type === "app.bsky.embed.record#view"}>
        <QuotedPostPreview
          author={getQuotedAuthor(props.embed)}
          href={quotedUri() && props.onOpenPost ? null : quotedInternalHref() ?? quotedExternalHref()}
          onOpenPost={quotedUri() && props.onOpenPost ? openQuotedPost : undefined}
          text={getQuotedText(props.embed)}
          title="Quoted post" />
      </Match>
      <Match when={props.embed.$type === "app.bsky.embed.recordWithMedia#view"}>
        <div class="grid gap-3">
          <Show when={media()}>
            {(current) => (
              <EmbedContent embed={current() as EmbedView} onOpenPost={props.onOpenPost} post={props.post} />
            )}
          </Show>
          <QuotedPostPreview
            author={getQuotedAuthor(props.embed)}
            href={quotedUri() && props.onOpenPost ? null : quotedInternalHref() ?? quotedExternalHref()}
            onOpenPost={quotedUri() && props.onOpenPost ? openQuotedPost : undefined}
            text={getQuotedText(props.embed)}
            title="Quoted post" />
        </div>
      </Match>
    </Switch>
  );
}
