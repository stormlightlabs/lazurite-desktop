import { ArrowIcon } from "./Icon";

export function HistoryControls(
  props: { canGoBack: boolean; canGoForward: boolean; onGoBack: () => void; onGoForward: () => void },
) {
  return (
    <>
      <button
        class="ui-control ui-control-hoverable inline-flex h-8 w-8 items-center justify-center rounded-full disabled:translate-y-0 disabled:cursor-none disabled:opacity-45"
        type="button"
        aria-label="Back"
        disabled={!props.canGoBack}
        onClick={() => props.onGoBack()}>
        <ArrowIcon direction="left" />
      </button>

      <button
        class="ui-control ui-control-hoverable inline-flex h-8 w-8 items-center justify-center rounded-full disabled:translate-y-0 disabled:cursor-none disabled:opacity-45"
        type="button"
        aria-label="Forward"
        disabled={!props.canGoForward}
        onClick={() => props.onGoForward()}>
        <ArrowIcon direction="right" />
      </button>
    </>
  );
}
