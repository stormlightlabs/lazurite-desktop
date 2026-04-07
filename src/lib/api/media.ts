import { invoke } from "@tauri-apps/api/core";
import type { DownloadResult } from "./types/media";

export function getDownloadDirectory() {
  return invoke<string>("get_download_directory");
}

export function setDownloadDirectory(path: string) {
  return invoke("set_download_directory", { path });
}

export function downloadImage(url: string, filename?: string | null) {
  return invoke<DownloadResult>("download_image", { filename: filename ?? null, url });
}

export function downloadVideo(url: string, filename?: string | null) {
  return invoke<DownloadResult>("download_video", { filename: filename ?? null, url });
}

export const MediaController = { getDownloadDirectory, setDownloadDirectory, downloadImage, downloadVideo };
