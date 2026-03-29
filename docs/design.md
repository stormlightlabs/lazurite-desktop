# Design System Spec

## Overview

This interface is a high-contrast, grid-based environment built on pure black (`#000000`) with a single electric accent. The visual system avoids template-like framing by replacing hard structure (lines, dividers, borders) with tonal layering and intentional asymmetry.

Design goal: focused, cinematic, and modern.

## Color and Surfaces

Space is defined by light and depth, and subtle lines. No gradients.

- **No-Line Rule:** Do not use 1px solid borders for sectioning. Separate regions by stepping between surface tokens (for example, `surface` to `surface_container_low`).
- **Surface hierarchy:**
- **Base layer:** `surface_container_lowest` (`#000000`) for deepest background and the void behind the app rail.
- **Primary work surface:** `surface` (`#0e0e0e`) for the default content canvas.
- **Elevated containers:** `surface_container` (`#191919`) and `surface_container_high` (`#1f1f1f`) for cards and interactive panels.
- **Glass overlays:** Floating modals and high-priority overlays use `surface_container_highest` at 70% opacity with `backdrop-blur: 20px` for an obsidian-glass effect.
- **Primary CTA texture:** Use a properly contrasted background

## Typography

Use **Google Sans** as both readability and structure.

- **Display and headline scale:** `display-lg` (3.5rem) and `headline-lg` (2rem) with tight tracking (`-0.02em`).
- **Body and labels:** `body-md` (0.875rem) is the default body size. Use `on_surface_variant` (`#ababab`) for secondary text against `on_surface` titles.
- **Asymmetric layout:** Avoid centered hero alignment. Keep headlines left-aligned and place supporting metadata in `label-sm` on the far right, using `spacing-8` (2rem) to preserve separation.

## Elevation and Depth

In a black UI, conventional drop shadows are low impact. Depth is created through tone and glow.

- **Layering principle:** Lift components by moving up the surface token scale (for example, `surface_container_low` on top of `surface`).
- **Ambient glow:** For floating UI (tooltips, dropdowns), use a `primary` shadow at 5% opacity with a 40px blur.
- **Ghost border fallback:** If a boundary is required for accessibility, use `outline_variant` (`#484848`) at 20% opacity.

## Component Rules

### App Rail

- Fixed-width rail on the far left using `surface_container_lowest`.
- Active icon color: `primary` (`#7dafff`); inactive: `on_surface_variant`.
- No persistent labels; labels may appear on hover when collapsed

### Buttons

- **Primary:** Solid fill (`primary` to `primary_dim`), text color `on_primary_fixed` (black), small radius (`sm`, 0.375rem).
- **Secondary:** Fill `surface_container_highest`, text `on_surface`, no border, radius `md` (0.75rem).
- **Tertiary:** Transparent background, text `primary`; use for low-emphasis actions (for example, Cancel).

### Cards and Lists

- Do not use horizontal dividers between list items.
- Separate items with `spacing-2` (0.5rem) vertical space.
- Use subtle hover state with `surface_bright` at 5% opacity.
- Card radius must be `lg` (1rem) or `xl` (1.5rem).

### Input Fields

- Use minimalist containers with `surface_container_low`.
- Focus state: 1px ghost border using `primary` at 50% opacity plus subtle glow.
- Avoid thick, fully opaque outlines.

## Dos & Don'ts

### Do

- Preserve large areas of pure `#000000` to maintain visual breathing room.
- Use `secondary_container` for chips/tags to create soft contrast.
- Apply subtle roundedness to key interactive controls (for example, buttons and search bars) to balance the hard screen geometry.
- Stick to size/weight from tailwind (`-xs`, `-lg`, etc.), only overriding/hardcoding when necessary for hierarchy or emphasis.

### Do Not

- Use pure white (`#FFFFFF`) for long-form body copy; use `on_secondary_container` (`#c9d1dd`) to reduce eye strain.
- Use fully opaque borders.
- Stack more than three surface-container depth levels; use a backdrop-blur overlay instead.
- No gradients, textures, or patterns. Avoid noise and visual clutter to maintain focus on content.
