import { Motion } from "solid-motionone";
import { AvatarBadge } from "./AvatarBadge";

export function SwitcherIdentity(props: { label: string; name: string; meta: string; tone: "primary" | "muted" }) {
  return (
    <Motion.div
      class="flex items-center gap-3"
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.94 }}
      transition={{ duration: 0.24 }}>
      <AvatarBadge label={props.label} tone={props.tone} />
      <div class="grid">
        <span class="text-[0.92rem] font-semibold">{props.name}</span>
        <span class="text-[0.78rem] text-on-surface-variant">{props.meta}</span>
      </div>
    </Motion.div>
  );
}
