import { normalizeError } from "$/lib/utils/text";
import * as logger from "@tauri-apps/plugin-log";
import { openUrl } from "@tauri-apps/plugin-opener";

export function openExternalUrlFromEvent(event: MouseEvent, uri: string | null | undefined, context: string) {
  event.stopPropagation();
  event.preventDefault();

  const normalizedUri = uri?.trim();
  if (!normalizedUri) {
    return;
  }

  void openUrl(normalizedUri).catch((error) => {
    logger.warn("failed to open external URL", {
      keyValues: { context, error: normalizeError(error), uri: normalizedUri },
    });
  });
}
