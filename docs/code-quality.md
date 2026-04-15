---
title: Code Quality Audits
updated: 2026-04-15
---

There is a ton of repeated code in this project. This document tracks repeated patterns
for future refactoring.

## Dialogs

### Inventory (2026-04-15)

| Component                   | File (relative to `src/components/`)           | Overlay style                                  | Dialog semantics                      | Notes                                                            |
| --------------------------- | ---------------------------------------------- | ---------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| Image gallery overlay       | `/feeds/ImageGallery.tsx`                      | Fullscreen glass overlay, centered media stage | `role="dialog"` + `aria-modal="true"` | Handles image navigation/download + keyboard controls.           |
| Report dialog               | `/moderation/ReportDialog.tsx`                 | Centered card on fullscreen scrim              | Missing `role="dialog"`/`aria-modal`  | Uses shared backdrop/surface naming but local implementation.    |
| Settings confirmation modal | `/settings/SettingsPanel.tsx`                  | Centered confirmation card                     | Missing `role="dialog"`/`aria-modal`  | Inline modal implementation nested inside settings panel.        |
| Add column panel            | `/deck/AddColumnPanel.tsx`                     | Right drawer with backdrop                     | `role="dialog"` + `aria-modal="true"` | Drawer-style overlay, good semantic baseline.                    |
| Profile actor list overlay  | `/profile/ProfileActorList.tsx`                | Bottom sheet style overlay                     | `role="dialog"` + `aria-modal="true"` | Focus target is set on open; closes on scrim click and `Escape`. |
| Follow hygiene panel        | `/profile/FollowHygienePanel.tsx`              | Right sheet/panel                              | `role="dialog"` + `aria-modal="true"` | Large panel overlay with keyboard and progress handling.         |
| Follow hygiene confirmation | `/profile/FollowHygeineConfirmationDialog.tsx` | Centered danger confirmation card              | Missing `role="dialog"`/`aria-modal`  | Standalone confirmation overlay implementation.                  |
| Feed composer               | `/feeds/FeedComposer.tsx`                      | Fullscreen composer dialog overlay             | Missing `role="dialog"`/`aria-modal`  | Uses custom panel and scrim; keyboard handling managed outside.  |
| Drafts list overlay         | `/feeds/DraftsList.tsx`                        | Bottom-aligned panel over fullscreen scrim     | Missing `role="dialog"`/`aria-modal`  | Similar layering/animation style to composer.                    |
| Thread drawer               | `/posts/ThreadDrawer.tsx`                      | Right drawer over fullscreen scrim             | Missing `role="dialog"`/`aria-modal`  | Uses close button + escape handler, but no dialog semantics yet. |
| Context menu (non-dialog)   | `/shared/ContextMenu.tsx`                      | Fullscreen hit target + positioned menu        | `role="menu"`                         | Not a modal dialog; still part of overlay infrastructure.        |

### Repeated Patterns

- Scrim/backdrop classes are duplicated across multiple files with slight class/token variations.
- Dialog/card enter-exit animation values are redefined in each component.
- Escape-key listener setup/teardown appears in several overlays and drawers.
- Many overlays still rely on click-to-close behavior without consistent semantic attributes.

### Refactor Candidates

- Extract a shared `OverlayBackdrop` primitive for fullscreen scrim + portal + optional click-to-close.
- Extract a shared `DialogSurface` primitive for animated card/sheet containers.
- Standardize dialog semantics (`role`, `aria-modal`, labeling) across all modal-like overlays.
- Centralize escape-key wiring in an overlay utility hook to reduce per-component lifecycle code.
