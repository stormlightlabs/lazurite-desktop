import { For } from "solid-js";
import { Icon } from "../shared/Icon";
import { STATUS_CATEGORIES, type StatusCategoryKey, type StatusCategoryState } from "./types";

type CategoryRowProps = {
  count: number;
  label: string;
  selected: boolean;
  visible: boolean;
  onToggleSelection: () => void;
  onToggleVisibility: () => void;
};

function CategoryRow(props: CategoryRowProps) {
  return (
    <div class="tone-muted flex items-center gap-2 rounded-xl px-3 py-2.5">
      <input
        aria-label={`Select ${props.label}`}
        checked={props.selected}
        class="h-4 w-4 rounded ui-outline-strong bg-transparent text-primary focus:ring-(--focus-ring)"
        disabled={props.count === 0}
        type="checkbox"
        onChange={() => props.onToggleSelection()} />
      <span class="min-w-0 flex-1 text-sm text-on-surface">{props.label}</span>
      <span class="text-xs text-on-surface-variant">{props.count}</span>
      <button
        class="ui-control ui-control-hoverable flex h-7 w-7 items-center justify-center rounded-full"
        title={props.visible ? `Hide ${props.label}` : `Show ${props.label}`}
        type="button"
        onClick={() => props.onToggleVisibility()}>
        <Icon iconClass={props.visible ? "i-ri-eye-line" : "i-ri-eye-off-line"} class="text-sm" />
      </button>
    </div>
  );
}

export type CategorySidebarProps = {
  counts: Record<StatusCategoryKey, number>;
  filters: Record<StatusCategoryKey, StatusCategoryState>;
  selectedCount: number;
  totalCount: number;
  onSelectAllVisible: () => void;
  onToggleCategorySelection: (key: StatusCategoryKey) => void;
  onToggleCategoryVisibility: (key: StatusCategoryKey) => void;
};

export function CategorySidebar(props: CategorySidebarProps) {
  return (
    <aside class="grid min-h-0 gap-3 lg:sticky lg:top-0">
      <div class="panel-surface grid gap-3 p-4">
        <div class="flex items-center justify-between gap-2">
          <h3 class="m-0 text-sm font-medium text-on-surface">Categories</h3>
          <span class="text-xs text-on-surface-variant">{props.selectedCount} selected</span>
        </div>

        <div class="grid gap-2">
          <For each={STATUS_CATEGORIES}>
            {(category) => (
              <CategoryRow
                count={props.counts[category.key]}
                label={category.label}
                selected={props.filters[category.key].selected}
                visible={props.filters[category.key].visible}
                onToggleSelection={() => props.onToggleCategorySelection(category.key)}
                onToggleVisibility={() => props.onToggleCategoryVisibility(category.key)} />
            )}
          </For>
        </div>

        <button
          class="ui-control ui-control-hoverable inline-flex min-h-9 items-center justify-center gap-2 rounded-full px-4 text-sm text-on-surface"
          type="button"
          onClick={() => props.onSelectAllVisible()}>
          <Icon iconClass="i-ri-checkbox-multiple-line" class="text-base" />
          Select all visible
        </button>
      </div>

      <div class="panel-surface grid gap-2 p-4">
        <p class="m-0 text-sm text-on-surface">Selection</p>
        <p class="m-0 text-xs text-on-surface-variant">{props.selectedCount} of {props.totalCount} flagged follows</p>
      </div>
    </aside>
  );
}
