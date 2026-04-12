import { normalizeError } from "$/lib/utils/text";

export function filenameFromPath(path: string) {
  const parts = path.split(/[/\\]/u);
  return parts.at(-1) || "downloaded file";
}

export function toDownloadErrorMessage(error: unknown, fallback: string) {
  const message = normalizeError(error);
  if (/download folder|writable|save|directory|exists/iu.test(message)) {
    return "Couldn't save — check that the download folder exists.";
  }

  return fallback;
}
