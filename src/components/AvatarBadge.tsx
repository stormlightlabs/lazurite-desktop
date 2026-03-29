import { createMemo } from "solid-js";

type AvatarBadgeProps = { label: string; src?: string | null; tone?: "primary" | "muted" };

export function AvatarBadge(props: AvatarBadgeProps) {
  const label = createMemo(() => {
    const token = props.label.replace(/^@/, "").replace(/^did:[^:]+:/, "").split(/[./:-]/).find(Boolean);
    return (token ?? "?").slice(0, 2).toUpperCase();
  });

  return (
    <span
      class="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold tracking-[0.08em]"
      classList={{
        "bg-primary text-[color:var(--on-primary-fixed)]": props.tone === "primary",
        "bg-white/8 text-on-surface": props.tone !== "primary",
      }}>
      {props.src ? <img class="h-full w-full object-cover" src={props.src} alt="" /> : label()}
    </span>
  );
}
