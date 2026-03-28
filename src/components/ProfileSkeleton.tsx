export function ProfileSkeleton() {
  return (
    <div class="grid gap-[0.85rem]" aria-hidden="true">
      <span class="skeleton-block h-18 w-18 rounded-full" />
      <span class="skeleton-block h-[0.85rem] w-[min(16rem,80%)] rounded-full" />
      <span class="skeleton-block h-[0.85rem] w-[min(11rem,64%)] rounded-full" />
      <span class="skeleton-block h-[0.85rem] w-[min(9rem,48%)] rounded-full" />
    </div>
  );
}
