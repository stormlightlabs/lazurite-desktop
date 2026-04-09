import { ExplorerController } from "$/lib/api/explorer";
import { ProfileController } from "$/lib/api/profile";
import type { ExplorerNavigation, ExplorerTargetKind } from "$/lib/api/types/explorer";
import { NAVIGATION_EVENT } from "$/lib/constants/events";
import { consumeQueuedExplorerTarget } from "$/lib/explorer-navigation";
import { listen } from "@tauri-apps/api/event";
import * as logger from "@tauri-apps/plugin-log";
import { createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { produce } from "solid-js/store";
import { Motion, Presence } from "solid-motionone";
import { createExplorerState } from "./explorer-state";
import { ExplorerBreadcrumb } from "./ExplorerBreadcrumb";
import { ExplorerUrlBar } from "./ExplorerUrlBar";
import type { ExplorerViewLevel, ExplorerViewState } from "./types";
import { CollectionView } from "./views/CollectionView";
import { PdsView } from "./views/PdsView";
import { RecordView } from "./views/RecordView";
import { RepoView } from "./views/RepoView";

function resolveTargetLevel(kind: ExplorerTargetKind): ExplorerViewLevel {
  return kind as ExplorerViewLevel;
}

function resolveParentInput(view: ExplorerViewState): string | null {
  switch (view.level) {
    case "record": {
      if (view.resolved?.did && view.resolved?.collection) {
        return `at://${view.resolved.did}/${view.resolved.collection}`;
      }
      break;
    }
    case "collection": {
      if (view.resolved?.did) {
        return `at://${view.resolved.did}`;
      }
      break;
    }
    case "repo": {
      if (view.resolved?.pdsUrl) {
        return view.resolved.pdsUrl;
      }
      break;
    }
  }
  return null;
}
function extractCollections(repoData: Record<string, unknown>): Array<{ nsid: string }> {
  const collections: Array<{ nsid: string }> = [];
  const collectionsData = repoData.collections;

  if (Array.isArray(collectionsData)) {
    for (const collection of collectionsData) {
      if (typeof collection === "string") {
        collections.push({ nsid: collection });
      }
    }
  }

  return collections.toSorted((left, right) => left.nsid.localeCompare(right.nsid));
}

function hasCachedLexiconIcon(icons: Record<string, string | null>, collection: string) {
  return Object.prototype.hasOwnProperty.call(icons, collection);
}

export function ExplorerPanel() {
  const explorer = createExplorerState();
  const [clearingIconCache, setClearingIconCache] = createSignal(false);
  const [statusMessage, setStatusMessage] = createSignal<{ kind: "error" | "success"; text: string } | null>(null);
  let resolveRequestId = 0;

  const canGoBack = createMemo(() => explorer.canGoBack());
  const canGoForward = createMemo(() => explorer.canGoForward());
  const breadcrumb = createMemo(() => explorer.getBreadcrumb());
  const canExport = createMemo(() => !!explorer.state.current?.resolved?.did);

  function setCurrentView(view: ExplorerViewState) {
    explorer.setState("current", view);
  }

  function updateCurrentView(updater: (draft: ExplorerViewState) => void) {
    explorer.setState(produce((draft) => {
      if (!draft.current) return;
      updater(draft.current);

      if (draft.historyIndex >= 0) {
        const currentHistory = draft.history[draft.historyIndex];
        if (currentHistory && currentHistory !== draft.current) {
          updater(currentHistory);
        }
      }
    }));
  }

  async function hydrateLexiconIcons(collections: string[], options?: { force?: boolean }) {
    const pendingCollections = [...new Set(collections)].filter((collection) => collection.trim().length > 0).filter((
      collection,
    ) => options?.force || !hasCachedLexiconIcon(explorer.state.lexiconIcons, collection));

    if (pendingCollections.length === 0) {
      return;
    }

    try {
      const icons = await ExplorerController.getLexiconFavicons(pendingCollections);
      explorer.mergeLexiconIcons(icons);
    } catch (error) {
      logger.warn("Failed to load lexicon favicons for explorer", {
        keyValues: { collections: pendingCollections.join(","), error: String(error) },
      });
    }
  }

  function currentLexiconCollections(): string[] {
    const current = explorer.state.current;
    if (!current) {
      return [];
    }

    if (current.repoData) {
      return current.repoData.collections.map((collection) => collection.nsid);
    }

    if (current.collectionData) {
      return [current.collectionData.collection];
    }

    if (current.resolved?.collection) {
      return [current.resolved.collection];
    }

    return [];
  }

  async function handleResolveInput(input: string) {
    if (!input.trim()) return;
    const submittedInput = input.trim();
    const requestId = ++resolveRequestId;

    setStatusMessage(null);
    explorer.setInputValue(submittedInput);
    setCurrentView({ level: "repo", input: submittedInput, resolved: null, loading: true, error: null, data: null });

    try {
      const resolved = await ExplorerController.resolveInput(submittedInput);
      if (requestId !== resolveRequestId) return;

      const level = resolveTargetLevel(resolved.targetKind);

      const viewState = { level, input: submittedInput, resolved, loading: true, error: null, data: null };

      setCurrentView(viewState);
      explorer.setInputValue(resolved.normalizedInput);

      let finalViewState: ExplorerViewState = viewState;
      switch (resolved.targetKind) {
        case "pds": {
          if (resolved.pdsUrl) {
            const serverView = await ExplorerController.describeServer(resolved.pdsUrl);
            finalViewState = {
              ...viewState,
              loading: false,
              pdsData: { repos: serverView.repos, server: serverView.server, cursor: serverView.cursor },
            };
          }
          break;
        }
        case "repo": {
          if (resolved.did) {
            const [repoData, profile] = await Promise.all([
              ExplorerController.describeRepo(resolved.did),
              ProfileController.getProfile(resolved.did).catch(() => null),
            ]);
            const profileData = profile?.status === "available" ? profile.profile : null;
            const collections = extractCollections(repoData);
            finalViewState = {
              ...viewState,
              loading: false,
              repoData: {
                collections,
                did: resolved.did,
                handle: resolved.handle || resolved.did,
                pdsUrl: resolved.pdsUrl,
                socialSummary: profileData
                  ? {
                    followerCount: profileData.followersCount ?? null,
                    followingCount: profileData.followsCount ?? null,
                  }
                  : null,
              },
            };
          }
          break;
        }
        case "collection": {
          if (resolved.did && resolved.collection) {
            const listData = await ExplorerController.listRecords(resolved.did, resolved.collection);
            finalViewState = {
              ...viewState,
              loading: false,
              collectionData: {
                records: (listData.records as Array<Record<string, unknown>>) || [],
                cursor: (listData.cursor as string) || null,
                did: resolved.did,
                collection: resolved.collection,
                loadingMore: false,
              },
            };
          }
          break;
        }
        case "record": {
          if (resolved.did && resolved.collection && resolved.rkey) {
            const [recordData, labels] = await Promise.all([
              ExplorerController.getRecord(resolved.did, resolved.collection, resolved.rkey),
              resolved.uri
                ? ExplorerController.queryLabels(resolved.uri).catch(() => ({ labels: [] }))
                : Promise.resolve({ labels: [] }),
            ]);
            finalViewState = {
              ...viewState,
              loading: false,
              recordData: {
                record: (recordData.value as Record<string, unknown>) || {},
                cid: (recordData.cid as string) || null,
                uri: resolved.uri || "",
                labels: (labels.labels as Array<Record<string, unknown>>) || [],
              },
            };
          }
          break;
        }
      }

      if (requestId !== resolveRequestId) return;
      explorer.pushView(finalViewState);

      if (finalViewState.repoData) {
        void hydrateLexiconIcons(finalViewState.repoData.collections.map((collection) => collection.nsid));
      } else if (finalViewState.collectionData) {
        void hydrateLexiconIcons([finalViewState.collectionData.collection]);
      }
    } catch (error) {
      if (requestId !== resolveRequestId) return;
      setCurrentView({
        level: "repo",
        input: submittedInput,
        resolved: null,
        loading: false,
        error: String(error),
        data: null,
      });
    }
  }

  function handleBack() {
    if (explorer.goBack()) {
      const current = explorer.state.current;
      if (current) {
        explorer.setInputValue(current.resolved?.normalizedInput || current.input);
      }
    }
  }

  function handleForward() {
    if (explorer.goForward()) {
      const current = explorer.state.current;
      if (current) {
        explorer.setInputValue(current.resolved?.normalizedInput || current.input);
      }
    }
  }

  function handleNavigateUp() {
    const current = explorer.state.current;
    if (!current?.resolved) return;

    const parentInput = resolveParentInput(current);

    if (parentInput) {
      void handleResolveInput(parentInput);
    }
  }

  function handleBreadcrumbClick(level: ExplorerTargetKind) {
    const current = explorer.state.current;
    if (!current?.resolved) return;

    const resolved = current.resolved;
    let targetInput: string | null = null;

    switch (level) {
      case "pds": {
        if (resolved.pdsUrl) targetInput = resolved.pdsUrl;
        break;
      }
      case "repo": {
        if (resolved.did) targetInput = `at://${resolved.did}`;
        break;
      }
      case "collection": {
        if (resolved.did && resolved.collection) {
          targetInput = `at://${resolved.did}/${resolved.collection}`;
        }
        break;
      }
      case "record": {
        if (resolved.uri) targetInput = resolved.uri;
        break;
      }
    }

    if (targetInput) {
      void handleResolveInput(targetInput);
    }
  }

  async function handleLoadMore() {
    const current = explorer.state.current;
    const collectionData = current?.collectionData;
    if (!collectionData?.cursor || collectionData.loadingMore) return;

    updateCurrentView((draft) => {
      if (draft.collectionData) {
        draft.collectionData.loadingMore = true;
      }
    });

    try {
      const nextPage = await ExplorerController.listRecords(
        collectionData.did,
        collectionData.collection,
        collectionData.cursor,
      );
      const nextRecords = (nextPage.records as Array<Record<string, unknown>>) || [];
      const nextCursor = (nextPage.cursor as string) || null;

      updateCurrentView((draft) => {
        if (!draft.collectionData) return;
        draft.collectionData.records = [...draft.collectionData.records, ...nextRecords];
        draft.collectionData.cursor = nextCursor;
        draft.collectionData.loadingMore = false;
      });
    } catch (error) {
      updateCurrentView((draft) => {
        if (draft.collectionData) {
          draft.collectionData.loadingMore = false;
        }
      });
      setStatusMessage({ kind: "error", text: String(error) });
    }
  }

  async function handleExport() {
    const did = explorer.state.current?.resolved?.did;
    if (!did) return;

    try {
      const result = await ExplorerController.exportRepoCar(did);
      setStatusMessage({ kind: "success", text: `Saved CAR export to ${result.path}` });
    } catch (error) {
      setStatusMessage({ kind: "error", text: String(error) });
    }
  }

  async function handleClearIconCache() {
    if (clearingIconCache()) {
      return;
    }

    setClearingIconCache(true);
    setStatusMessage(null);

    try {
      await ExplorerController.clearLexiconFaviconCache();
      explorer.resetLexiconIcons();
      setStatusMessage({ kind: "success", text: "Cleared explorer icon cache." });

      const collections = currentLexiconCollections();
      if (collections.length > 0) {
        await hydrateLexiconIcons(collections, { force: true });
      }
    } catch (error) {
      setStatusMessage({ kind: "error", text: String(error) });
    } finally {
      setClearingIconCache(false);
    }
  }

  function handleRepoClick(did: string) {
    void handleResolveInput(`at://${did}`);
  }

  function handleCollectionClick(did: string, collection: string) {
    void handleResolveInput(`at://${did}/${collection}`);
  }

  function handleRecordClick(did: string, collection: string, rkey: string) {
    void handleResolveInput(`at://${did}/${collection}/${rkey}`);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "l") {
      event.preventDefault();
      const input = document.querySelector("[data-explorer-input]") as HTMLInputElement;
      input?.focus();
      input?.select();
      return;
    }

    if (
      event.key === "Backspace"
      && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
    ) {
      event.preventDefault();
      handleNavigateUp();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "[") {
      event.preventDefault();
      handleBack();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "]") {
      event.preventDefault();
      handleForward();
      return;
    }
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    const pendingTarget = consumeQueuedExplorerTarget();

    void listen<ExplorerNavigation>(NAVIGATION_EVENT, (event) => {
      const target = event.payload.target;
      void handleResolveInput(target.uri ?? target.normalizedInput);
    }).then((dispose) => {
      unlisten = dispose;
    });

    document.addEventListener("keydown", handleKeyDown);

    if (pendingTarget) {
      void handleResolveInput(pendingTarget);
    }

    onCleanup(() => {
      unlisten?.();
      document.removeEventListener("keydown", handleKeyDown);
    });
  });

  const currentView = createMemo(() => explorer.state.current);

  return (
    <div class="flex h-full flex-col overflow-hidden">
      <ExplorerUrlBar
        value={explorer.state.inputValue}
        canGoBack={canGoBack()}
        canGoForward={canGoForward()}
        canExport={canExport()}
        clearingIconCache={clearingIconCache()}
        onInput={explorer.setInputValue}
        onSubmit={handleResolveInput}
        onBack={handleBack}
        onForward={handleForward}
        onClearIconCache={handleClearIconCache}
        onExport={handleExport} />

      <Show when={breadcrumb().length > 0}>
        <ExplorerBreadcrumb items={breadcrumb()} onNavigate={handleBreadcrumbClick} />
      </Show>

      <Show when={statusMessage()}>
        {(message) => (
          <div class="px-6 pt-4">
            <div
              class="rounded-2xl px-4 py-3 text-sm shadow-(--inset-shadow)"
              classList={{
                "bg-error-surface text-error": message().kind === "error",
                "bg-surface-container-high text-on-surface": message().kind === "success",
              }}>
              {message().text}
            </div>
          </div>
        )}
      </Show>

      <div class="flex-1 overflow-hidden">
        <Show when={currentView()} fallback={<InitialEmptyPanel onExampleClick={handleResolveInput} />}>
          {(view) => (
            <Presence exitBeforeEnter>
              <Motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                class="h-full overflow-auto p-6">
                <Switch>
                  <Match when={view().error}>
                    <div class="rounded-3xl bg-error-surface p-4 text-sm text-error shadow-(--inset-shadow)">
                      {view().error}
                    </div>
                  </Match>

                  <Match when={view().loading}>
                    <ExplorerSkeleton />
                  </Match>

                  <Match when={view().level === "pds" && view().pdsData}>
                    <PdsView
                      server={view().pdsData!.server}
                      repos={view().pdsData!.repos}
                      onRepoClick={handleRepoClick} />
                  </Match>

                  <Match when={view().level === "repo" && view().repoData}>
                    <RepoView
                      collections={view().repoData!.collections}
                      did={view().repoData!.did}
                      handle={view().repoData!.handle}
                      lexiconIcons={explorer.state.lexiconIcons}
                      onCollectionClick={(collection: string) =>
                        handleCollectionClick(view().repoData!.did, collection)}
                      pdsUrl={view().repoData!.pdsUrl}
                      onPdsClick={() => {
                        const pdsUrl = view().repoData?.pdsUrl;
                        if (pdsUrl) {
                          void handleResolveInput(pdsUrl);
                        }
                      }}
                      socialSummary={view().repoData!.socialSummary} />
                  </Match>

                  <Match when={view().level === "collection" && view().collectionData}>
                    <CollectionView
                      did={view().collectionData!.did}
                      collection={view().collectionData!.collection}
                      lexiconIcon={explorer.state.lexiconIcons[view().collectionData!.collection] ?? null}
                      records={view().collectionData!.records}
                      cursor={view().collectionData!.cursor}
                      loadingMore={view().collectionData!.loadingMore}
                      onLoadMore={handleLoadMore}
                      onRecordClick={(rkey) =>
                        handleRecordClick(view().collectionData!.did, view().collectionData!.collection, rkey)} />
                  </Match>

                  <Match when={view().level === "record" && view().recordData}>
                    <RecordView
                      record={view().recordData!.record}
                      cid={view().recordData!.cid}
                      uri={view().recordData!.uri}
                      labels={view().recordData!.labels} />
                  </Match>

                  <Match when={!view().loading && !view().error}>
                    <EmptyPanel />
                  </Match>
                </Switch>
              </Motion.div>
            </Presence>
          )}
        </Show>
      </div>
    </div>
  );
}

function InitialEmptyPanel(props: { onExampleClick: (value: string) => void | Promise<void> }) {
  const examples = [{ label: "@handle", value: "@alice.bsky.social" }, { label: "did", value: "did:plc:alice" }, {
    label: "at://",
    value: "at://did:plc:alice/app.bsky.feed.post/123",
  }, { label: "PDS URL", value: "https://pds.example.com" }];

  return (
    <div class="flex h-full items-start overflow-auto p-6">
      <section class="mx-auto grid w-full max-w-4xl gap-6 rounded-[1.75rem] bg-surface-container p-8 shadow-(--inset-shadow)">
        <div class="grid gap-2">
          <p class="overline-copy text-xs text-primary/80">AT Protocol Explorer</p>
          <h1 class="m-0 text-[2rem] font-medium tracking-[-0.03em] text-on-surface">
            Start from a handle, DID, URI, or PDS.
          </h1>
          <p class="m-0 max-w-2xl text-sm leading-6 text-on-surface-variant">
            Browse repositories, collections, records, and server metadata without leaving Lazurite.
          </p>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <For each={examples}>
            {(example) => (
              <button
                type="button"
                onClick={() => void props.onExampleClick(example.value)}
                class="rounded-2xl bg-surface-container-high px-4 py-4 text-left shadow-(--inset-shadow) transition duration-150 ease-out hover:-translate-y-px hover:bg-surface-bright">
                <p class="m-0 text-xs uppercase tracking-[0.12em] text-on-surface-variant">{example.label}</p>
                <p class="mt-2 truncate text-sm font-mono text-primary">{example.value}</p>
              </button>
            )}
          </For>
        </div>

        <p class="m-0 text-xs text-on-surface-variant">
          Tip: start with <span class="font-mono text-primary">@</span> to get handle suggestions in the explorer bar.
        </p>
      </section>
    </div>
  );
}

function EmptyPanel() {
  return (
    <div class="grid min-h-96 place-items-center">
      <div class="text-center">
        <p class="text-lg font-medium text-on-surface">Enter an AT URI to explore</p>
        <p class="text-sm text-on-surface-variant mt-2">Try: at://did:plc:xyz/app.bsky.feed.post/123</p>
      </div>
    </div>
  );
}

function ExplorerSkeleton() {
  return (
    <div class="grid gap-4" aria-hidden="true">
      <div class="skeleton-block h-8 w-1/3 rounded-lg" />
      <div class="skeleton-block h-4 w-1/4 rounded" />
      <div class="grid gap-2 mt-4">
        <For each={Array.from({ length: 5 })}>{() => <div class="skeleton-block h-16 rounded-xl" />}</For>
      </div>
    </div>
  );
}
