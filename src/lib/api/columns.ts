import { invoke } from "@tauri-apps/api/core";
import type { Column, ColumnKind, ColumnWidth } from "./types/columns";

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
