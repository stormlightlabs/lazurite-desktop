import { createMemo } from "solid-js";

type AvatarBadgeProps = { label: string; tone?: "primary" | "muted" };

export function AvatarBadge(props: AvatarBadgeProps) {
  const label = createMemo(() => {
    const token = props.label.replace(/^@/, "").replace(/^did:[^:]+:/, "").split(/[./:-]/).find(Boolean);
    return (token ?? "?").slice(0, 2).toUpperCase();
  });

  return (
    <span
      class="inline-flex h-10 w-10 items-center justify-center rounded-full text-[0.82rem] font-bold tracking-[0.08em]"
      classList={{
        "bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] text-[color:var(--on-primary-fixed)]":
          props.tone === "primary",
        "bg-white/8 text-on-surface": props.tone !== "primary",
      }}>
      {label()}
    </span>
  );
}
