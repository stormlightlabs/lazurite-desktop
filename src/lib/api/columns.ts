import { invoke } from "@tauri-apps/api/core";

export type ColumnKind = "feed" | "explorer" | "diagnostics";

export type ColumnWidth = "narrow" | "standard" | "wide";

export type Column = {
  id: string;
  accountDid: string;
  kind: ColumnKind;
  config: string;
  position: number;
  width: ColumnWidth;
  createdAt: string;
};

export type FeedColumnConfig = { feedUri: string; feedType: "timeline" | "feed" | "list" };

export type ExplorerColumnConfig = { targetUri: string };

export type DiagnosticsColumnConfig = { did: string };

export function getColumns(accountDid: string) {
  return invoke<Column[]>("get_columns", { accountDid });
}

export function addColumn(accountDid: string, kind: ColumnKind, config: string, position?: number) {
  return invoke<Column>("add_column", { accountDid, config, kind, position: position ?? null });
}

export function removeColumn(id: string) {
  return invoke<void>("remove_column", { id });
}

export function reorderColumns(ids: string[]) {
  return invoke<void>("reorder_columns", { ids });
}

export function updateColumn(id: string, opts: { config?: string; width?: ColumnWidth }) {
  return invoke<Column>("update_column", { config: opts.config ?? null, id, width: opts.width ?? null });
}
