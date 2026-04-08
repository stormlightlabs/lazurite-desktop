import { RecordBacklinksPanel } from "$/components/diagnostics/RecordBacklinksPanel";
import { type JsonValue, JsonValueAs } from "$/components/explorer/types";
import { ArrowIcon, Icon } from "$/components/shared/Icon";
import { PostRichText } from "$/components/shared/PostRichText";
import { getStringProperty, isRecordLike, isString } from "$/lib/type-guards";
import type { PostRecord } from "$/lib/types";
import { createMemo, createSignal, For, type ParentProps, Show } from "solid-js";
import { Motion } from "solid-motionone";

type RecordViewProps = {
  record: Record<string, unknown>;
  cid: string | null;
  uri: string;
  labels: Array<Record<string, unknown>>;
};

function SyntaxHighlightedJson(props: { data: JsonValue; level?: number }) {
  const indent = () => "  ".repeat(props.level || 0);
  const stringValue = () => JsonValueAs.string(props.data);
  const numberValue = () => JsonValueAs.number(props.data);
  const booleanValue = () => JsonValueAs.boolean(props.data);
  const arrayValue = () => JsonValueAs.array(props.data);
  const objectValue = () => JsonValueAs.object(props.data);

  return (
    <span>
      <Show when={props.data === null}>
        <span class="text-error">null</span>
      </Show>
      <Show when={booleanValue() !== null}>
        <span class="text-error">{String(booleanValue())}</span>
      </Show>
      <Show when={numberValue() !== null}>
        <span class="text-blue-400">{String(numberValue())}</span>
      </Show>
      <Show when={stringValue() !== null}>
        <span class="text-green-400">"{stringValue()}"</span>
      </Show>
      <Show when={arrayValue()}>
        <Show when={arrayValue()!.length > 0} fallback={<span>[]</span>}>
          <span>[</span>
          <div class="pl-4">
            <For each={arrayValue()!}>
              {(item, index) => (
                <div>
                  {indent()}
                  <SyntaxHighlightedJson data={item} level={(props.level || 0) + 1} />
                  <Show when={index() < arrayValue()!.length - 1}>,</Show>
                </div>
              )}
            </For>
          </div>
          <span>{indent()}]</span>
        </Show>
      </Show>
      <Show when={objectValue()}>
        <Show when={Object.keys(objectValue()!).length > 0} fallback={<span>{`{}`}</span>}>
          <span>{"{"}</span>
          <div class="pl-4">
            <For each={Object.entries(objectValue()!)}>
              {([key, value], index) => (
                <div>
                  {indent()}
                  <span class="text-primary">"{key}"</span>
                  <span>:</span>
                  <SyntaxHighlightedJson data={value} level={(props.level || 0) + 1} />
                  <Show when={index() < Object.keys(objectValue()!).length - 1}>,</Show>
                </div>
              )}
            </For>
          </div>
          <span>{indent()}{"}"}</span>
        </Show>
      </Show>
    </span>
  );
}

function CollapsibleSection(props: ParentProps & { title: string }) {
  const [isOpen, setIsOpen] = createSignal(true);

  return (
    <div class="rounded-xl border border-white/10 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen())}
        class="w-full flex items-center justify-between px-4 py-3 bg-black/30 hover:bg-black/40 transition-colors">
        <span class="text-sm font-medium">{props.title}</span>
        <Motion.span animate={{ rotate: isOpen() ? 0 : -90 }} transition={{ duration: 0.15 }}>
          <ArrowIcon direction="down" />
        </Motion.span>
      </button>
      <Show when={isOpen()}>
        <div class="p-4 overflow-x-auto">{props.children}</div>
      </Show>
    </div>
  );
}

function SubjectPreview(props: { subject: Record<string, unknown> | string }) {
  const subject = createMemo(() => props.subject);
  const stringSubject = createMemo(() => {
    const s = subject();
    return (isString(s) ? s : null);
  });

  const objectSubject = createMemo(() => {
    const s = subject();
    return (isRecordLike(s) ? s : null);
  });

  const uri = createMemo(() => {
    const s = objectSubject();
    return s ? getStringProperty(s, "uri") : null;
  });

  const cid = createMemo(() => {
    const s = objectSubject();
    return s ? getStringProperty(s, "cid") : null;
  });

  return (
    <div class="grid gap-2">
      <Show when={stringSubject()}>{(value) => <p class="text-sm font-mono text-primary">{value()}</p>}</Show>
      <Show when={uri()}>{(value) => <p class="text-sm font-mono text-primary break-all">{value()}</p>}</Show>
      <Show when={cid()}>{(value) => <p class="text-xs font-mono text-on-surface-variant">CID: {value()}</p>}</Show>
    </div>
  );
}

function KnownRecordPreview(props: { record: Record<string, unknown> }) {
  const kind = () => (props.record.$type as string) || "";
  const postRecord = () => props.record as PostRecord;
  const content = () => (isString(postRecord().text) ? postRecord().text : null);
  const subject = () => {
    const value = props.record.subject;

    if (isString(value) || isRecordLike(value)) {
      return value;
    }
    return null;
  };

  return (
    <Show
      when={kind() === "app.bsky.feed.post"}
      fallback={
        <Show when={subject()}>
          {(value) => (
            <CollapsibleSection title="Subject">
              <div class="p-4 rounded-xl bg-black/30">
                <SubjectPreview subject={value()} />
              </div>
            </CollapsibleSection>
          )}
        </Show>
      }>
      <Show when={content()}>
        {value => (
          <CollapsibleSection title="Post Preview">
            <div class="p-4 rounded-xl bg-black/30">
              <PostRichText class="text-sm" facets={postRecord().facets} text={value()} />
            </div>
          </CollapsibleSection>
        )}
      </Show>
    </Show>
  );
}

export function RecordView(props: RecordViewProps) {
  const recordType = () => (props.record.$type as string) || "Unknown";
  const createdAt = () => (props.record.createdAt as string) || null;

  return (
    <div class="grid gap-6 max-w-4xl">
      <section class="rounded-2xl border border-white/5 p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-primary/15">
            <Icon kind="file" class="text-primary text-xl" />
          </div>
          <div>
            <h1 class="text-lg font-medium">{recordType()}</h1>
            <p class="text-xs font-mono text-on-surface-variant truncate max-w-md">{props.uri}</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <Show when={props.cid}>
            {(value) => (
              <div class="p-3 rounded-xl bg-white/5">
                <p class="text-xs uppercase tracking-wider mb-1 text-on-surface-variant">CID</p>
                <p class="text-xs font-mono truncate">{value()}</p>
              </div>
            )}
          </Show>
          <Show when={createdAt()}>
            {(date) => (
              <div class="p-3 rounded-xl bg-white/5">
                <p class="text-xs uppercase tracking-wider mb-1 text-on-surface-variant">Created</p>
                <p class="text-xs">{new Date(date()).toLocaleString()}</p>
              </div>
            )}
          </Show>
        </div>
      </section>

      <CollapsibleSection title="Record Data">
        <pre class="text-sm font-mono leading-relaxed">
          <SyntaxHighlightedJson data={props.record as JsonValue} />
        </pre>
      </CollapsibleSection>

      <KnownRecordPreview record={props.record} />

      <CollapsibleSection title="Backlinks">
        <RecordBacklinksPanel uri={props.uri} />
      </CollapsibleSection>

      <Show when={props.labels.length > 0}>
        <CollapsibleSection title="Moderation Labels">
          <div class="grid gap-3">
            <For each={props.labels}>
              {(label) => (
                <div class="rounded-xl bg-black/30 p-4">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
                      {String(label.val ?? "unknown")}
                    </span>
                    <span class="text-xs text-on-surface-variant">Source: {String(label.src ?? "unknown")}</span>
                  </div>
                  <p class="mt-2 text-xs text-on-surface-variant break-all">{String(label.uri ?? props.uri)}</p>
                </div>
              )}
            </For>
          </div>
        </CollapsibleSection>
      </Show>
    </div>
  );
}
